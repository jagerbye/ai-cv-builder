import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID, createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS, type JobTestSuite } from './test-lock.js';
import { createJobWorker } from './worker.js';
import { startJobLoop } from './loop.js';
import type { CvDraft, GenerationPipeline } from '../generation/types.js';

// T-28 (CVB-31). api/src/main.ts runs the worker as a poll loop. startJobLoop is that loop:
// it calls worker.runOnce on an interval, and stop() is graceful: it resolves only after the run in
// flight has reached a terminal status, so an in-flight run is never torn mid-transaction.
// Real Postgres; the pipeline is a fake at the C-012 seam.

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder';

const prisma = new PrismaClient();
const suite: JobTestSuite = openJobTestSuite(prisma);
const userIds: string[] = [];

const draft: CvDraft = {
  targetRole: 'Backend Engineer',
  summary: { text: 'Loop summary', factIds: [] },
  experience: [],
  education: [],
  skills: [{ name: 'Loop skill', factIds: [] }],
};

function pipeline(onCompose?: () => Promise<void>): GenerationPipeline {
  return {
    async extract() {
      return [];
    },
    async compose(_facts, targetRole) {
      await onCompose?.();
      return { ...draft, targetRole };
    },
    verify(accepted) {
      return { accepted, questions: [], dropped: [] };
    },
  };
}

async function seedQueuedJob(): Promise<{ jobId: string; cvId: string }> {
  const userId = randomUUID();
  userIds.push(userId);
  await prisma.user.create({
    data: {
      id: userId,
      email: `job-loop-${userId}@example.test`,
      passwordHash: createHash('sha256').update(randomBytes(16)).digest('hex'),
    },
  });
  const cv = await prisma.cv.create({
    data: { userId, targetRole: 'Backend Engineer', sourceKind: 'text', sourceText: 'x', state: 'generating' },
  });
  const jobId = await suite.enqueue({ cvId: cv.id, userId, status: 'queued' });
  return { jobId, cvId: cv.id };
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('condition not reached within the timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}

beforeAll(async () => {
  await suite.lock();
}, JOB_SUITE_LOCK_WAIT_MS);

afterEach(async () => {
  const ids = userIds.splice(0);
  if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await prisma.$disconnect();
  await suite.release();
});

describe('T-28 job loop: polls without a caller', () => {
  it('runs a queued job on its own within a few poll intervals, and the row reads succeeded', async () => {
    const { jobId, cvId } = await seedQueuedJob();
    const worker = createJobWorker({ prisma, pipeline: pipeline(), workerId: 'loop-poll', leaseMs: 300_000 });

    const loop = startJobLoop({ worker, intervalMs: 20 });
    try {
      await waitFor(async () => (await prisma.generationJob.findUnique({ where: { id: jobId } }))?.status === 'succeeded');
    } finally {
      await loop.stop();
    }

    const cv = await prisma.cv.findUnique({ where: { id: cvId }, select: { state: true, version: true } });
    expect(cv).toEqual({ state: 'ready', version: 2 });
  });

  it('an idle loop keeps polling and stops cleanly with nothing queued', async () => {
    const worker = createJobWorker({ prisma, pipeline: pipeline(), workerId: 'loop-idle', leaseMs: 300_000 });

    const loop = startJobLoop({ worker, intervalMs: 5 });
    await new Promise((r) => setTimeout(r, 50));
    await expect(loop.stop()).resolves.toBeUndefined();
  });
});

describe('T-28 job loop: graceful stop', () => {
  it('stop() waits for the run in flight, and the run ends in a terminal status with its draft stored', async () => {
    const { jobId, cvId } = await seedQueuedJob();
    let reachedCompose!: () => void;
    const composeReached = new Promise<void>((r) => (reachedCompose = r));
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));

    const worker = createJobWorker({
      prisma,
      pipeline: pipeline(async () => {
        reachedCompose();
        await released;
      }),
      workerId: 'loop-graceful',
      leaseMs: 300_000,
    });
    const loop = startJobLoop({ worker, intervalMs: 5 });

    await composeReached;
    let stopped = false;
    const stopping = loop.stop().then(() => {
      stopped = true;
    });

    // The run is mid-compose: stop must not resolve, and must not have aborted the run.
    await new Promise((r) => setTimeout(r, 100));
    expect(stopped).toBe(false);
    expect((await prisma.generationJob.findUnique({ where: { id: jobId } }))?.status).toBe('running');

    release();
    await stopping;

    const row = await prisma.generationJob.findUnique({ where: { id: jobId } });
    expect(row).toMatchObject({ status: 'succeeded', attempt: 1, errorCode: null });
    const cv = await prisma.cv.findUnique({ where: { id: cvId }, select: { state: true, version: true } });
    expect(cv).toEqual({ state: 'ready', version: 2 });
  });
});
