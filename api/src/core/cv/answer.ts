import { randomUUID } from 'node:crypto';
import type { CvItem, Prisma, PrismaClient } from '@prisma/client';
import { ApiError, safeMessage, type ErrorCode } from '../../http/errors.js';
import { GatewayError } from '../generation/gateway.js';
import { createTokenLedger } from '../generation/ledger.js';
import type { CvDraft, Fact, GenerationPipeline } from '../generation/types.js';
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

// Gateway failures that keep their own code on the 503; everything else reads as transient.
const NON_TRANSIENT: readonly ErrorCode[] = ['CONFIG_MISSING', 'LLM_AUTH_FAILED', 'LLM_INVALID_REQUEST', 'LLM_BUDGET_EXCEEDED'];

const FACT_KIND: Record<string, string> = { experience: 'employment', education: 'education' };

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
  const itemPath = bound ? `${bound[1]}[${bound[2]}]` : null;
  const factId = randomUUID();
  const storedAt = new Date();

  // Step 1: the answer is stored. The updateMany guard makes a concurrent second answer a 409, not a second fact.
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
        kind: bound ? FACT_KIND[bound[1]] : 'other',
        text: answer,
        sourceQuote: '',
        source: 'user',
      },
    });
    await tx.cv.update({ where: { id: cvId }, data: { version: { increment: 1 } } });
  });

  // Step 2: the targeted recompose. Any failure here is 503; the answer above is already stored.
  let accepted: CvDraft;
  try {
    const facts = (await prisma.fact.findMany({ where: { cvId }, orderBy: { createdAt: 'asc' } })).map(toFact);
    // One ledger per answer, sized like a job's (ADR-021 Amendment A): a call without one is bounded by nothing.
    const draft = await pipeline.compose(facts, cv.targetRole, createTokenLedger(tokenBudget));
    accepted = pipeline.verify(draft, facts).accepted;
  } catch (err) {
    // ADR-020: always 503, but the envelope carries the failure's real code when it is one nobody fixes by waiting.
    const code = err instanceof GatewayError && NON_TRANSIENT.includes(err.code) ? err.code : 'LLM_UNAVAILABLE';
    throw new ApiError(503, code, safeMessage(code));
  }

  // Step 3: the bound field takes the answer (F-006: a user fact bypasses the verifier, so the
  // verifier's verdict does not gate it). The entry's employer and role may be refreshed only from
  // a verified draft entry carrying the same period, since those came from the documents.
  if (bound && itemPath) {
    const kind = bound[1];
    await prisma.$transaction(async (tx) => {
      const item = await tx.cvItem.findFirst({ where: { cvId, path: itemPath, kind } });
      if (!item) return;
      const data: Record<string, unknown> = { ...(item.data as Record<string, unknown>), period: answer };
      if (kind === 'experience') {
        const verified = accepted.experience.find((e) => e.period === answer);
        if (verified) {
          data.employer = verified.employer;
          data.role = verified.role;
        }
      }
      await writeItem(tx, item, data, factId);
    });
  }

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
