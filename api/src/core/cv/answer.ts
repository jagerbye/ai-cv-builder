import { randomUUID } from 'node:crypto';
import type { CvItem, Prisma, PrismaClient } from '@prisma/client';
import { ApiError, safeMessage, type ErrorCode } from '../../http/errors.js';
import { GatewayError } from '../generation/gateway.js';
import { createTokenLedger } from '../generation/ledger.js';
import type { Fact, GenerationPipeline } from '../generation/types.js';
import type { PlannedVerification } from '../generation/verify.js';
import { MAX_OPEN_QUESTIONS } from '../generation/questions.js';
import { getCv } from './read.js';
import type { CvResponse } from './types.js';

// T-20 (CVB-17). C-009 POST /api/cvs/:cvId/questions/:questionId/answer, spec F-005 and F-006.
// Order is the contract: the answer is stored first (a user fact, the question marked answered),
// then the owning section is recomposed. A failed recompose leaves the stored answer in place
// and answers 503 with the failure's real code (ADR-020). Only the bound path's field is written by the answer (F-005):
// generated bullets are never written here.

export const ANSWER_MAX_CHARS = 2000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Question paths name a field of one experience or education entry, e.g. experience[0].period.
const BOUND_PATH = /^(experience|education)\[(\d+)\]\.period$/;
// ADR-030. A contact question asks for the value itself ("What is your full name?"), so the answer IS the field.
const CONTACT_PATH = /^contact\.(fullName|email|phone|location)$/;
// The same caps C-008 PATCH applies (patch.ts), so one route cannot store what the other would reject.
const CONTACT_MAX_CHARS: Record<string, number> = { fullName: 200, email: 200, phone: 50, location: 200 };

// Gateway failures that keep their own code on the 503; everything else reads as transient.
const NON_TRANSIENT: readonly ErrorCode[] = ['CONFIG_MISSING', 'LLM_AUTH_FAILED', 'LLM_INVALID_REQUEST', 'LLM_BUDGET_EXCEEDED'];

const FACT_KIND: Record<string, string> = { experience: 'employment', education: 'education' };

// Writes one contact field from the user's answer. The contact row is created when the CV has none, which is
// exactly the case the question exists for: nothing was grounded, so nothing was stored.
async function writeContactField(
  tx: Prisma.TransactionClient,
  cvId: string,
  field: string,
  value: string,
  factId: string,
): Promise<void> {
  const row = await tx.cvItem.findFirst({ where: { cvId, kind: 'contact' } });
  const data: Record<string, unknown> = { ...((row?.data as Record<string, unknown>) ?? {}) };
  const citations: Record<string, unknown> = { ...((data.citations as Record<string, unknown>) ?? {}) };
  citations[field] = [factId];
  data[field] = value;
  data.citations = citations;
  if (row) {
    await tx.cvItem.update({
      where: { id: row.id },
      data: { data: data as Prisma.InputJsonValue, factIds: [...row.factIds, factId], userEdited: true },
    });
    return;
  }
  await tx.cvItem.create({
    data: {
      cvId, kind: 'contact', path: 'contact', orderIndex: 0,
      data: data as Prisma.InputJsonValue, factIds: [factId], relevance: null, userEdited: true,
    },
  });
}

function notFound(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'Not found.');
}

function conflict(): ApiError {
  return new ApiError(409, 'CONFLICT', 'This question has already been answered.');
}

function parseAnswer(body: unknown): string {
  const answer = typeof body === 'object' && body !== null ? (body as { answer?: unknown }).answer : undefined;
  if (typeof answer !== 'string') {
    throw new ApiError(400, 'VALIDATION', 'answer must be a string of 1 to 2000 characters.');
  }
  const trimmed = answer.trim();
  if (trimmed.length < 1 || trimmed.length > ANSWER_MAX_CHARS) {
    throw new ApiError(400, 'VALIDATION', 'answer must be a string of 1 to 2000 characters.');
  }
  return trimmed;
}

function toFact(row: { id: string; kind: string; text: string; sourceQuote: string; source: string }): Fact {
  return { id: row.id, kind: row.kind, text: row.text, sourceQuote: row.sourceQuote, source: row.source as Fact['source'] };
}

export async function answerQuestion(
  prisma: PrismaClient,
  pipeline: GenerationPipeline,
  userId: string,
  cvId: string,
  questionId: string,
  body: unknown,
  tokenBudget: number,
): Promise<CvResponse> {
  if (!UUID.test(cvId) || !UUID.test(questionId)) throw notFound();
  const answer = parseAnswer(body);

  // Ownership first: another user's CV and a question of another CV both read as 404.
  const cv = await prisma.cv.findFirst({ where: { id: cvId, userId }, select: { targetRole: true } });
  if (!cv) throw notFound();
  const question = await prisma.question.findFirst({ where: { id: questionId, cvId } });
  if (!question) throw notFound();
  if (question.status !== 'open') throw conflict();

  const bound = BOUND_PATH.exec(question.path);
  const contactField = CONTACT_PATH.exec(question.path)?.[1];
  if (contactField !== undefined && answer.length > CONTACT_MAX_CHARS[contactField]) {
    throw new ApiError(400, 'VALIDATION', `answer must be at most ${CONTACT_MAX_CHARS[contactField]} characters.`);
  }
  const sectionKind = /^(experience|education)(?![a-z])/.exec(question.path)?.[1];
  const factId = randomUUID();
  const storedAt = new Date();

  // Step 1: the answer is stored. The updateMany guard makes a concurrent second answer a 409, not a second fact.
  // A contact answer is written in this same transaction (ADR-030): the answer IS the field's value, so there is
  // nothing for the model to recompose, and storing the fact without the field would leave the CV still nameless.
  await prisma.$transaction(async (tx) => {
    const marked = await tx.question.updateMany({
      where: { id: questionId, cvId, status: 'open' },
      data: { status: 'answered', answer, answeredAt: storedAt },
    });
    if (marked.count === 0) throw conflict();
    await tx.fact.create({
      data: {
        id: factId,
        cvId,
        kind: contactField ? 'contact' : sectionKind ? FACT_KIND[sectionKind] : 'other',
        text: answer,
        sourceQuote: '',
        source: 'user',
      },
    });
    if (contactField !== undefined) await writeContactField(tx, cvId, contactField, answer, factId);
    await tx.cv.update({ where: { id: cvId }, data: { version: { increment: 1 } } });
  });

  // F-006: a user fact bypasses the verifier, so a contact answer needs no model call. That also removes the 503
  // a user could get for typing their own name, and the tokens a recompose would spend touching nothing.
  if (contactField !== undefined) return getCv(prisma, userId, cvId);

  // Step 2: the targeted recompose. Any failure here is 503; the answer above is already stored.
  let verdict: PlannedVerification;
  try {
    const facts = (await prisma.fact.findMany({ where: { cvId }, orderBy: { createdAt: 'asc' } })).map(toFact);
    // One ledger per answer, sized like a job's (ADR-021 Amendment A): a call without one is bounded by nothing.
    const draft = await pipeline.compose(facts, cv.targetRole, createTokenLedger(tokenBudget));
    verdict = pipeline.verify(draft, facts) as PlannedVerification;
  } catch (err) {
    // ADR-020: always 503, but the envelope carries the failure's real code when it is one nobody fixes by waiting.
    const code = err instanceof GatewayError && NON_TRANSIENT.includes(err.code) ? err.code : 'LLM_UNAVAILABLE';
    throw new ApiError(503, code, safeMessage(code));
  }
  const accepted = verdict.accepted;

  await prisma.$transaction(async (tx) => {
    // Step 3a: the bound field takes the answer (F-006: a user fact bypasses the verifier, so the verifier's verdict
    // does not gate it). The entry's employer and role may be refreshed only from a verified draft entry carrying the
    // same period, since those came from the documents.
    if (bound) {
      const item = question.itemId
        ? await tx.cvItem.findFirst({ where: { id: question.itemId, cvId } })
        : await tx.cvItem.findFirst({ where: { cvId, path: `${bound[1]}[${bound[2]}]`, kind: bound[1] } });
      if (item) {
        const data: Record<string, unknown> = { ...(item.data as Record<string, unknown>), period: answer };
        if (bound[1] === 'experience') {
          const verified = accepted.experience.find((e) => e.period === answer);
          if (verified) {
            data.employer = verified.employer;
            data.role = verified.role;
          }
        }
        await writeItem(tx, item, data, factId);
      }
    }

    // Step 3b (ADR-027, ADR-026 priority 1): the answer's facts went back through verify, and an entry, education or
    // skill the new evidence supports that the CV does not hold is restored. Bullets are never written here (F-005).
    const stored = await tx.cvItem.findMany({ where: { cvId, parentId: null } });
    const idByKey = new Map<string, string>();
    const usedPaths = new Set(stored.map((i) => i.path));
    const keyOf = (kind: string, d: Record<string, unknown>): string | null => {
      const raw = kind === 'experience' ? d.employer : kind === 'education' ? d.institution : d.name;
      return typeof raw === 'string' && raw.trim() !== '' ? `${kind}:${raw.trim().toLowerCase()}` : null;
    };
    for (const item of stored) {
      const key = keyOf(item.kind, item.data as Record<string, unknown>);
      if (key !== null) idByKey.set(key, item.id);
    }
    const nextSlot = (prefix: string, kind: string): { path: string; order: number } => {
      const mine = stored.filter((i) => i.kind === kind);
      let n = mine.length;
      while (usedPaths.has(`${prefix}[${n}]`)) n += 1;
      usedPaths.add(`${prefix}[${n}]`);
      return { path: `${prefix}[${n}]`, order: Math.max(-1, ...mine.map((i) => i.orderIndex)) + 1 + (n - mine.length) };
    };
    const restore = async (kind: string, prefix: string, d: Record<string, unknown>, factIds: string[], relevance: number | null): Promise<void> => {
      const key = keyOf(kind, d);
      if (key === null || idByKey.has(key)) return;
      const slot = nextSlot(prefix, kind);
      const created = await tx.cvItem.create({
        data: {
          cvId, kind, path: slot.path, orderIndex: slot.order, data: d as Prisma.InputJsonValue,
          factIds: factIds.includes(factId) ? factIds : [...factIds, factId], relevance, userEdited: false,
        },
      });
      idByKey.set(key, created.id);
    };
    const clean = (o: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    // Section-scoped (C-009): only the section the answered question belongs to is touched.
    const section = /^(experience|education|skills)(?![a-z])/.exec(question.path)?.[1];
    for (const e of section === 'experience' ? accepted.experience : []) {
      await restore('experience', 'experience', clean({ employer: e.employer, role: e.role, period: e.period, location: e.location }), e.factIds, e.relevance);
    }
    for (const e of section === 'education' ? accepted.education : []) {
      await restore('education', 'education', clean({ institution: e.institution, degree: e.degree, period: e.period }), e.factIds, null);
    }
    for (const sk of section === 'skills' ? accepted.skills : []) await restore('skill', 'skills', clean({ name: sk.name, group: sk.group }), sk.factIds, null);

    // Step 3c: persist the re-verify's questions. Each binds to the stored item it is about (found by what the entry
    // is, not where it sat in the draft) or names its section. An open section question the verifier no longer asks
    // is resolved by the answer and goes; a question the user already answered is not asked again.
    const SECTIONS = section ? [section] : [];
    const wanted: { itemId: string | null; path: string; text: string; reason: string; priority: number }[] = [];
    for (const q of verdict.questions ?? []) {
      const m = /^(experience|education|skills)\[(\d+)\](.*)$/.exec(q.boundPath);
      if (m !== null && m[1] !== section) continue;
      if (m === null) {
        if (SECTIONS.includes(q.boundPath)) wanted.push({ itemId: null, path: q.boundPath, text: q.text, reason: q.reason, priority: q.priority });
        continue;
      }
      if (m[3].includes('bullets')) continue;
      const entry = m[1] === 'experience' ? accepted.experience[Number(m[2])] : m[1] === 'education' ? accepted.education[Number(m[2])] : accepted.skills[Number(m[2])];
      if (!entry) continue;
      const kind = m[1] === 'skills' ? 'skill' : m[1];
      const key = keyOf(kind, entry as unknown as Record<string, unknown>);
      const itemId = key === null ? undefined : idByKey.get(key);
      if (itemId === undefined) continue;
      const fresh = await tx.cvItem.findUniqueOrThrow({ where: { id: itemId }, select: { path: true } });
      wanted.push({ itemId, path: `${fresh.path}${m[3]}`, text: q.text, reason: q.reason, priority: q.priority });
    }
    const existing = await tx.question.findMany({ where: { cvId, status: { in: ['open', 'answered'] } } });
    const sameAs = (r: { itemId: string | null; path: string; text: string }, w: { itemId: string | null; path: string; text: string }) =>
      r.text === w.text && r.itemId === w.itemId && r.path === w.path;
    const staleIds = existing
      .filter((r) => r.status === 'open' && r.itemId === null && SECTIONS.includes(r.path) && !wanted.some((w) => sameAs(r, w)))
      .map((r) => r.id);
    if (staleIds.length > 0) await tx.question.deleteMany({ where: { id: { in: staleIds } } });
    const openLeft = existing.filter((r) => r.status === 'open' && !staleIds.includes(r.id));
    const fresh = wanted.filter((w) => !existing.some((r) => r.id !== questionId && r.status === 'open' && !staleIds.includes(r.id) && sameAs(r, w)) && !existing.some((r) => r.status === 'answered' && sameAs(r, w)));
    const room = Math.max(0, MAX_OPEN_QUESTIONS - openLeft.length);
    if (fresh.length > 0 && room > 0) {
      await tx.question.createMany({
        data: fresh.slice(0, room).map((w) => ({ cvId, itemId: w.itemId, path: w.path, text: w.text, reason: w.reason, status: 'open', priority: w.priority })),
      });
    }
    await tx.cv.update({ where: { id: cvId }, data: { version: { increment: 1 } } });
  });

  return getCv(prisma, userId, cvId);
}

async function writeItem(
  tx: Prisma.TransactionClient,
  item: CvItem,
  data: Record<string, unknown>,
  factId: string,
): Promise<void> {
  await tx.cvItem.update({
    where: { id: item.id },
    data: {
      data: data as Prisma.InputJsonValue,
      factIds: [...item.factIds, factId],
      userEdited: true,
    },
  });
}
