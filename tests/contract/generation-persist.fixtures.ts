import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { CvDraft, Fact, GenerationPipeline, QuestionDraft, VerificationResult } from '../../api/src/core/generation/types.js';

// Shared fixtures for the T-28 persist contract tests (generation-persist*.test.ts). Real Postgres,
// real Fastify app; the LLM is the C-012 seam (GenerationPipeline) with no network. Nothing here
// asserts behaviour: the suites do that. Enqueueing goes through openJobTestSuite (ADR-014).

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';

export const prisma = new PrismaClient();
export const userIds: string[] = [];

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Owner {
  userId: string;
  cookie: string;
}

export async function seedUser(): Promise<Owner> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `generation-persist-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });
  return { userId, cookie: `sid=${token}` };
}

// A CV the way intake leaves it: state generating (the state a queued job implies), version 1, one
// intake contact item that the draft does not carry.
export async function seedCv(userId: string): Promise<string> {
  const cvId = randomUUID();
  await prisma.cv.create({
    data: {
      id: cvId,
      userId,
      title: 'Ada Lovelace – Backend Engineer',
      targetRole: 'Backend Engineer',
      sourceKind: 'text',
      sourceText: 'Ada Lovelace, Backend Engineer, London. Lead Engineer at Babbage Works. Skills: TypeScript.',
      state: 'generating',
      version: 1,
    },
  });
  await prisma.cvItem.create({
    data: {
      cvId,
      kind: 'contact',
      path: 'contact',
      orderIndex: 0,
      data: { fullName: 'Ada Lovelace', links: [] },
      factIds: [],
      userEdited: false,
    },
  });
  return cvId;
}

// A draft with several distinct entries per section, so a store that keeps one row or one
// hard-coded value cannot satisfy the comparison. Every fact id is a fresh uuid.
export function draftFor(token: string): CvDraft {
  return {
    targetRole: 'Backend Engineer',
    summary: { text: `Summary ${token}`, factIds: [randomUUID()] },
    experience: [
      {
        employer: `Employer ${token} A`,
        role: 'Engineer',
        period: 'Jan 2019 – Present',
        relevance: 0.9,
        factIds: [randomUUID()],
        bullets: [
          { text: `Bullet ${token} A1`, factIds: [randomUUID()] },
          { text: `Bullet ${token} A2`, factIds: [] },
        ],
      },
      {
        employer: `Employer ${token} B`,
        role: 'Analyst',
        period: 'Mar 2015 – Dec 2018',
        location: 'Leeds',
        relevance: 0.5,
        factIds: [],
        bullets: [{ text: `Bullet ${token} B1`, factIds: [randomUUID()] }],
      },
    ],
    education: [{ institution: `University ${token}`, degree: 'BSc', period: '2011 – 2014', factIds: [randomUUID()] }],
    skills: [
      { name: `TypeScript ${token}`, group: 'Languages', factIds: [randomUUID()] },
      { name: `PostgreSQL ${token}`, factIds: [] },
    ],
  };
}

export function questionsFor(token: string): QuestionDraft[] {
  return [{ path: 'experience[1]', text: `Question ${token}: what was your role at Employer ${token} B?` }];
}

// The C-012 seam. extract and verify are deterministic; compose returns draftFor(token) so every
// stored value carries the token of the run that produced it.
// Every fact id a draft cites, once each.
export function factIdsOf(draft: CvDraft): string[] {
  const ids = [
    ...(draft.summary?.factIds ?? []),
    ...draft.experience.flatMap((e) => [...e.factIds, ...e.bullets.flatMap((b) => b.factIds)]),
    ...draft.education.flatMap((e) => e.factIds),
    ...draft.skills.flatMap((s) => s.factIds),
  ];
  return [...new Set(ids)];
}

// The facts the extract stage would have produced for a draft: one document fact per cited id, so a
// stored item's factIds can resolve. The text carries the run token.
export function factsFor(token: string, draft: CvDraft): Fact[] {
  return factIdsOf(draft).map((id) => ({
    id,
    kind: 'experience',
    text: `Fact ${token} ${id}`,
    sourceQuote: `Quote ${token} ${id}`,
    source: 'document' as const,
  }));
}

export function fakePipeline(token: string, draft: CvDraft = draftFor(token)): GenerationPipeline {
  return {
    async extract(): Promise<Fact[]> {
      return factsFor(token, draft);
    },
    async compose(): Promise<CvDraft> {
      return draft;
    },
    verify(accepted: CvDraft): VerificationResult {
      return { accepted, questions: questionsFor(token), dropped: [] };
    },
  };
}

export function getCv(app: { inject: (o: object) => Promise<any> }, cookie: string, cvId: string) {
  return app.inject({ method: 'GET', url: `/api/cvs/${cvId}`, headers: { cookie } });
}

export function getJob(app: { inject: (o: object) => Promise<any> }, cookie: string, jobId: string) {
  return app.inject({ method: 'GET', url: `/api/jobs/${jobId}`, headers: { cookie } });
}

export function regenerate(app: { inject: (o: object) => Promise<any> }, cookie: string, cvId: string) {
  return app.inject({ method: 'POST', url: `/api/cvs/${cvId}/regenerate`, headers: { cookie } });
}

// Every item row of a CV, for "nothing stored" and "exactly one draft" checks. The order is TOTAL:
// orderIndex alone ties (contact and summary are both 0, so is every first entry of a section) and
// Postgres returns ties in whatever order it likes. The tie-break follows C-006's section order
// (contact, summary, experience, education, skills; a bullet sits with its section's kind rank last
// within an equal orderIndex), then path, then id.
const KIND_RANK: Record<string, number> = { contact: 0, summary: 1, experience: 2, education: 3, skill: 4, bullet: 5 };
export async function itemsOf(cvId: string) {
  const rows = await prisma.cvItem.findMany({ where: { cvId } });
  const rank = (kind: string) => KIND_RANK[kind] ?? 99;
  return rows.sort(
    (a, b) =>
      a.orderIndex - b.orderIndex ||
      rank(a.kind) - rank(b.kind) ||
      a.path.localeCompare(b.path) ||
      a.id.localeCompare(b.id),
  );
}

// Wraps a Prisma client so a test can hold the worker's persist transaction open. The hold starts
// only after the worker's 'verifying' stage write has landed: from then on the next transaction is
// the one that persists the verified draft. Earlier transactions (the claim) pass straight through.
export function gatedPrisma(base: PrismaClient) {
  let armed = false;
  let markHeld!: () => void;
  const held = new Promise<void>((resolve) => (markHeld = resolve));
  let openGate!: () => void;
  const gate = new Promise<void>((resolve) => (openGate = resolve));
  const tracked: Promise<unknown>[] = [];

  const jobs = new Proxy(base.generationJob, {
    get(target, prop) {
      if (prop === 'updateMany') {
        return async (args: { data?: Record<string, unknown> }) => {
          const res = await target.updateMany(args as never);
          if (args.data?.stage === 'verifying') armed = true;
          return res;
        };
      }
      return Reflect.get(target, prop, target);
    },
  });

  const client = new Proxy(base, {
    get(target, prop) {
      if (prop === 'generationJob') return jobs;
      if (prop === '$transaction') {
        return (...args: unknown[]) => {
          const run = async () => {
            if (armed) {
              markHeld();
              await gate;
            }
            return (target.$transaction as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          };
          const pending = run();
          tracked.push(pending);
          return pending;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as PrismaClient;

  return {
    client,
    // Resolves when a persist transaction is waiting at the gate.
    held,
    release: () => openGate(),
    // Resolves once every transaction the wrapper has started has settled (committed or rolled back).
    settled: async () => {
      await Promise.allSettled(tracked);
    },
  };
}
