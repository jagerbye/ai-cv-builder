import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../api/src/server.js';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS, type JobTestSuite } from '../../api/src/core/jobs/test-lock.js';
import { createJobWorker } from '../../api/src/core/jobs/worker.js';
import type { CvDraft, Fact, GenerationPipeline, VerificationResult } from '../../api/src/core/generation/types.js';

// T-26 (CVB-29). Contract tests for C-010: POST /api/cvs/:cvId/regenerate → 202 { jobId }.
// Spec: api-contracts.md C-010 (and C-005 for the job the 202 names), ADR-004 (one queue: the
// generation_jobs table), ADR-014 (tests enqueue non-terminal rows only through openJobTestSuite).
// Real Fastify app and real Postgres; the LLM is the C-012 seam (GenerationPipeline), no network.
//
// The route only enqueues. The merge is observed by running the worker once (createJobWorker)
// after the 202, then reading the CV back through C-006.
//
// Error envelope: { error: { code, message, details? } } (C-000). Another user's CV is 404, never 403.

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';

const prisma = new PrismaClient();
const suite: JobTestSuite = openJobTestSuite(prisma);
let app: FastifyInstance;
const userIds: string[] = [];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Owner {
  userId: string;
  cookie: string;
}

async function seedUser(): Promise<Owner> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `cvs-regenerate-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
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

async function seedCv(userId: string, state: 'ready' | 'failed' | 'generating' = 'ready'): Promise<string> {
  const cvId = randomUUID();
  await prisma.cv.create({
    data: {
      id: cvId,
      userId,
      title: 'Ada Lovelace – Backend Engineer',
      targetRole: 'Backend Engineer',
      sourceKind: 'text',
      sourceText: 'Ada Lovelace, Backend Engineer, London. Lead Engineer at Babbage Works. Skills: TypeScript.',
      state,
      version: 1,
      updatedAt: new Date('2026-10-20T10:00:00.000Z'),
    },
  });
  return cvId;
}

// Items for the merge test. experience[1] is the user's hand-set entry (userEdited=true) and must
// survive. experience[0] is generated and not edited, so regeneration must replace it.
async function seedMergeCv(userId: string): Promise<{ cvId: string; editedId: string; siblingId: string }> {
  const cvId = await seedCv(userId, 'ready');
  const editedId = randomUUID();
  const siblingId = randomUUID();
  await prisma.cvItem.createMany({
    data: [
      {
        id: siblingId,
        cvId,
        kind: 'experience',
        path: 'experience[0]',
        orderIndex: 0,
        data: { employer: 'Old Employer', role: 'Engineer', period: 'Jan 2019 – Present' },
        factIds: [],
        relevance: 0.9,
        userEdited: false,
      },
      {
        id: editedId,
        cvId,
        kind: 'experience',
        path: 'experience[1]',
        orderIndex: 1,
        data: { employer: 'Hand Employer', role: 'Analyst', period: 'Hand-set period' },
        factIds: [],
        relevance: 0.4,
        userEdited: true,
      },
    ],
  });
  return { cvId, editedId, siblingId };
}

// The C-012 seam. compose() returns entries whose text carries a per-test token, so a route or a
// merge that returns fixed or stale values cannot satisfy the assertions below.
function fakePipeline(token: string): GenerationPipeline {
  return {
    async extract(): Promise<Fact[]> {
      return [];
    },
    async compose(_facts: Fact[], targetRole: string): Promise<CvDraft> {
      return {
        targetRole,
        summary: { text: `Generated summary ${token}`, factIds: [] },
        experience: [
          {
            employer: `Generated ${token} 0`,
            role: 'Engineer',
            period: `Generated period ${token} 0`,
            relevance: 0.9,
            factIds: [],
            bullets: [{ text: `Generated bullet ${token}`, factIds: [] }],
          },
          {
            employer: `Generated ${token} 1`,
            role: 'Engineer',
            period: `Generated period ${token} 1`,
            relevance: 0.5,
            factIds: [],
            bullets: [],
          },
        ],
        education: [],
        skills: [],
      };
    },
    verify(draft: CvDraft, _facts: Fact[]): VerificationResult {
      return { accepted: draft, questions: [], dropped: [] };
    },
  };
}

function regenerate(cookie: string, cvId: string) {
  return app.inject({ method: 'POST', url: `/api/cvs/${cvId}/regenerate`, headers: { cookie } });
}

function getCv(cookie: string, cvId: string) {
  return app.inject({ method: 'GET', url: `/api/cvs/${cvId}`, headers: { cookie } });
}

function getJob(cookie: string, jobId: string) {
  return app.inject({ method: 'GET', url: `/api/jobs/${jobId}`, headers: { cookie } });
}

// C-000: every non-2xx body is { error: { code, message, details? } } and nothing else at the top level.
function expectEnvelope(res: { statusCode: number; json: () => any }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  const body = res.json();
  expect(Object.keys(body)).toEqual(['error']);
  expect(Object.keys(body.error).every((k) => ['code', 'message', 'details'].includes(k))).toBe(true);
  expect(body.error.code).toBe(code);
  return body;
}

async function jobsFor(cvId: string) {
  return prisma.generationJob.findMany({ where: { cvId }, orderBy: { createdAt: 'asc' } });
}

beforeAll(async () => {
  await suite.lock();
  app = buildServer({ generationPipeline: fakePipeline('unused-by-route') });
  await app.ready();
}, JOB_SUITE_LOCK_WAIT_MS);

afterAll(async () => {
  // Users cascade to sessions, cvs, cv_items and generation_jobs.
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
  await prisma.$disconnect();
  await suite.release();
});

describe('C-010 POST /api/cvs/:cvId/regenerate: 202 and the shared queue', () => {
  let owner: Owner;

  beforeEach(async () => {
    owner = await seedUser();
  });

  it('answers 202 with exactly { jobId } where jobId is a UUID', async () => {
    const cvId = await seedCv(owner.userId, 'ready');

    const res = await regenerate(owner.cookie, cvId);

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(Object.keys(body)).toEqual(['jobId']);
    expect(body.jobId).toMatch(UUID);
  });

  it('enqueues a queued job row for that CV in the same generation_jobs queue the intake path uses', async () => {
    const cvId = await seedCv(owner.userId, 'ready');

    const res = await regenerate(owner.cookie, cvId);
    expect(res.statusCode).toBe(202);
    const { jobId } = res.json();

    const row = await prisma.generationJob.findUnique({ where: { id: jobId } });
    expect(row).not.toBeNull();
    expect(row).toMatchObject({ cvId, userId: owner.userId, status: 'queued', scope: 'full', attempt: 0 });
  });

  it('the job the 202 names is visible through C-005 as queued, the same as an intake job', async () => {
    const cvId = await seedCv(owner.userId, 'ready');
    const { jobId } = (await regenerate(owner.cookie, cvId)).json();

    const res = await getJob(owner.cookie, jobId);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: jobId, cvId, status: 'queued', stage: null });
  });

  it('puts the CV back into generating, read back through C-006', async () => {
    const cvId = await seedCv(owner.userId, 'ready');

    await regenerate(owner.cookie, cvId);

    const row = await prisma.cv.findUnique({ where: { id: cvId }, select: { state: true } });
    expect(row?.state).toBe('generating');
    const body = (await getCv(owner.cookie, cvId)).json();
    expect(body.state).toBe('generating');
  });

  it('accepts a regenerate from a failed CV and moves it to generating', async () => {
    const cvId = await seedCv(owner.userId, 'failed');

    const res = await regenerate(owner.cookie, cvId);

    expect(res.statusCode).toBe(202);
    expect((await getCv(owner.cookie, cvId)).json().state).toBe('generating');
  });
});

describe('C-010 POST /api/cvs/:cvId/regenerate: 409 when a job is already in flight', () => {
  let owner: Owner;

  beforeEach(async () => {
    owner = await seedUser();
  });

  it('answers 409 CONFLICT when a queued job for the CV exists, and enqueues nothing new', async () => {
    const cvId = await seedCv(owner.userId, 'generating');
    await suite.enqueue({ cvId, userId: owner.userId, status: 'queued' });
    const before = await jobsFor(cvId);

    const res = await regenerate(owner.cookie, cvId);

    expectEnvelope(res, 409, 'CONFLICT');
    const after = await jobsFor(cvId);
    expect(after.map((j) => j.id)).toEqual(before.map((j) => j.id));
  });

  it('leaves the CV in state ready when the 409 rolls back (no half-applied generating write)', async () => {
    const cvId = await seedCv(owner.userId, 'ready');
    await suite.enqueue({ cvId, userId: owner.userId, status: 'queued' });

    expectEnvelope(await regenerate(owner.cookie, cvId), 409, 'CONFLICT');

    expect((await prisma.cv.findUniqueOrThrow({ where: { id: cvId } })).state).toBe('ready');
    expect((await getCv(owner.cookie, cvId)).json().state).toBe('ready');
  });

  it('answers 409 CONFLICT when a running job for the CV exists', async () => {
    const cvId = await seedCv(owner.userId, 'generating');
    await suite.enqueue({
      cvId,
      userId: owner.userId,
      status: 'running',
      stage: 'composing',
      attempt: 1,
      startedAt: new Date(),
      leasedUntil: new Date(Date.now() + 60_000),
    });

    expectEnvelope(await regenerate(owner.cookie, cvId), 409, 'CONFLICT');
  });

  it('two concurrent regenerates on an idle CV give one 202 and one 409, never a 500', async () => {
    const cvId = await seedCv(owner.userId, 'ready');

    const [a, b] = await Promise.all([regenerate(owner.cookie, cvId), regenerate(owner.cookie, cvId)]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
    const loser = a.statusCode === 409 ? a : b;
    expect(loser.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    const queued = (await jobsFor(cvId)).filter((j) => j.status === 'queued');
    expect(queued).toHaveLength(1);
  });

  it('answers 202 again once the earlier job has reached a terminal status', async () => {
    const cvId = await seedCv(owner.userId, 'ready');
    await suite.enqueue({
      cvId,
      userId: owner.userId,
      status: 'failed',
      attempt: 2,
      startedAt: new Date('2026-10-28T10:00:00.000Z'),
      finishedAt: new Date('2026-10-28T10:03:00.000Z'),
      errorCode: 'JOB_TIMEOUT',
      errorMessage: 'The generation did not finish within 180 seconds.',
    });

    const res = await regenerate(owner.cookie, cvId);

    expect(res.statusCode).toBe(202);
  });
});

describe('C-010 POST /api/cvs/:cvId/regenerate: 404 NOT_FOUND', () => {
  let owner: Owner;

  beforeEach(async () => {
    owner = await seedUser();
  });

  // Positive control: the same route answers 202 for the owner's own CV, so a 404 below is the route's answer, not a missing route.
  async function expectRouteLive(owner: Owner) {
    const own = await seedCv(owner.userId, 'ready');
    expect((await regenerate(owner.cookie, own)).statusCode).toBe(202);
  }

  it('answers 404 NOT_FOUND for a CV id that does not exist, and enqueues nothing', async () => {
    await expectRouteLive(owner);
    const jobsBefore = await prisma.generationJob.count({ where: { userId: owner.userId } });

    const res = await regenerate(owner.cookie, randomUUID());

    expectEnvelope(res, 404, 'NOT_FOUND');
    expect(await prisma.generationJob.count({ where: { userId: owner.userId } })).toBe(jobsBefore);
  });

  it('answers 404 NOT_FOUND for a malformed CV id', async () => {
    await expectRouteLive(owner);
    expectEnvelope(await regenerate(owner.cookie, 'not-a-uuid'), 404, 'NOT_FOUND');
  });

  it("answers 404 NOT_FOUND for another user's CV, enqueues nothing for it, and leaves it untouched", async () => {
    await expectRouteLive(owner);
    const other = await seedUser();
    const otherCvId = await seedCv(other.userId, 'ready');

    const res = await regenerate(owner.cookie, otherCvId);

    expectEnvelope(res, 404, 'NOT_FOUND');
    expect(await jobsFor(otherCvId)).toHaveLength(0);
    const row = await prisma.cv.findUnique({ where: { id: otherCvId }, select: { state: true } });
    expect(row?.state).toBe('ready');
  });
});

describe('C-010 regeneration merge: userEdited fields survive, the non-edited sibling is replaced', () => {
  let owner: Owner;

  beforeEach(async () => {
    owner = await seedUser();
  });

  it('after the worker runs the regenerate job, the hand-edited item is unchanged and the sibling is replaced', async () => {
    const token = randomUUID().slice(0, 8);
    const { cvId, editedId, siblingId } = await seedMergeCv(owner.userId);

    const res = await regenerate(owner.cookie, cvId);
    expect(res.statusCode).toBe(202);
    const { jobId } = res.json();

    const worker = createJobWorker({
      prisma,
      pipeline: fakePipeline(token),
      workerId: `cvs-regenerate-test-${token}`,
      leaseMs: 60_000,
    });
    // The worker claims across the whole queue (FIFO by created_at), not per CV, and earlier tests
    // in this file leave non-terminal jobs for other CVs behind. So this test drains the queue,
    // one runOnce at a time, until it sees its own job id come back; it cannot target its job directly.
    let ran: string | null = null;
    do {
      ran = await worker.runOnce();
    } while (ran !== null && ran !== jobId);
    expect(ran).toBe(jobId);

    const cv = (await getCv(owner.cookie, cvId)).json();
    const experience = cv.experience as { employer: string; period: string; userEdited: boolean }[];

    // Survives: the user-edited entry keeps its exact values and its flag.
    const edited = experience.find((e) => e.period === 'Hand-set period');
    expect(edited).toBeDefined();
    expect(edited).toMatchObject({ employer: 'Hand Employer', role: 'Analyst', period: 'Hand-set period', userEdited: true });

    // Replaced: the stored non-edited entry is gone and its generated successor is in its place.
    expect(experience.some((e) => e.employer === 'Old Employer')).toBe(false);
    expect(experience.some((e) => e.employer === `Generated ${token} 0`)).toBe(true);
    expect(experience.every((e) => e.userEdited === false || e.employer === 'Hand Employer')).toBe(true);

    // The stored rows agree with the read: the edited row is the same row, the sibling row is gone.
    expect(await prisma.cvItem.findUnique({ where: { id: editedId } })).not.toBeNull();
    expect(await prisma.cvItem.findUnique({ where: { id: siblingId } })).toBeNull();
  });
});
