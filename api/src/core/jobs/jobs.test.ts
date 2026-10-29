import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS } from './test-lock.js';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { GenerationPipeline, Fact, CvDraft, VerificationResult } from '../generation/types.js';
// T-16 (CVB-8). Durable job worker: lease, reclaim, budget, restart, terminal immutability.
// Real Postgres, never mocked: SKIP LOCKED, leased_until and the budget are DB/timing behaviour.
// The pipeline is a fake that satisfies GenerationPipeline (C-012). Lane 04's implementation
// is never imported; only the interface in ../generation/types.js.
//
// Module under test (developer names it this way, see lane-05 block):
//   createJobWorker({ prisma, pipeline, workerId, leaseMs, budgetMs? }) -> JobWorker
//   JobWorker.claimNext(): Promise<{ id } | null>   leases one job (SKIP LOCKED), attempt + 1
//   JobWorker.runOnce(): Promise<string | null>     claimNext, then runs the pipeline to a terminal state
//   JobWorker.stop(): void                          simulates process death: no more renewals
//   JOB_BUDGET_MS = 180_000

import { createJobWorker, JOB_BUDGET_MS } from './worker.js';

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder';

const prisma = new PrismaClient();
const suite = openJobTestSuite(prisma);
const userIds: string[] = [];

const FACT: Fact = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'employment',
  text: 'Engineer at Analytical Engines',
  sourceQuote: 'Engineer at Analytical Engines, Jan 2015 to Dec 2017.',
  source: 'document',
};

const DRAFT: CvDraft = { targetRole: 'Backend Engineer', experience: [], education: [], skills: [] };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(check: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('waitFor: timed out');
    await sleep(10);
  }
}

interface SeededCv {
  cvId: string;
  userId: string;
  sourceText: string;
  targetRole: string;
}

async function seedCv(): Promise<SeededCv> {
  const userId = randomUUID();
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `jobs-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  const sourceText = `Ada Lovelace. Engineer at Analytical Engines, Jan 2015 to Dec 2017. ${userId}`;
  const targetRole = 'Backend Engineer';
  const cv = await prisma.cv.create({
    data: { userId, targetRole, sourceKind: 'text', sourceText, state: 'generating' },
  });
  return { cvId: cv.id, userId, sourceText, targetRole };
}

async function seedJob(
  seed: SeededCv,
  data: Partial<{
    status: string;
    stage: string | null;
    attempt: number;
    leasedUntil: Date | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    errorCode: string | null;
    errorMessage: string | null;
  }> = {},
): Promise<string> {
  return suite.enqueue({
      cvId: seed.cvId,
      userId: seed.userId,
      status: data.status ?? 'queued',
      stage: data.stage ?? null,
      attempt: data.attempt ?? 0,
      leasedUntil: data.leasedUntil ?? null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
      errorCode: data.errorCode ?? null,
      errorMessage: data.errorMessage ?? null,
  });
}

async function row(jobId: string) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error(`job ${jobId} not found`);
  return job;
}

interface FakeHooks {
  extract?: (sourceText: string) => Promise<void>;
  compose?: (facts: Fact[], targetRole: string) => Promise<void>;
}

// Fake pipeline: records every call and its arguments; hooks can stall or throw.
function fakePipeline(hooks: FakeHooks = {}) {
  const calls: string[] = [];
  const extractArgs: string[] = [];
  const composeArgs: { facts: Fact[]; targetRole: string }[] = [];
  const pipeline: GenerationPipeline = {
    async extract(sourceText: string): Promise<Fact[]> {
      calls.push('extract');
      extractArgs.push(sourceText);
      await hooks.extract?.(sourceText);
      // A fresh id per run: facts.id is a primary key and the real extract stage mints a uuid per fact.
      return [{ ...FACT, id: randomUUID() }];
    },
    async compose(facts: Fact[], targetRole: string): Promise<CvDraft> {
      calls.push('compose');
      composeArgs.push({ facts, targetRole });
      await hooks.compose?.(facts, targetRole);
      return DRAFT;
    },
    verify(draft: CvDraft): VerificationResult {
      calls.push('verify');
      return { accepted: draft, questions: [], dropped: [] };
    },
  };
  return { pipeline, calls, extractArgs, composeArgs };
}

beforeAll(async () => {
  await suite.lock();
  // Non-terminal jobs from other runs would be claimed by these tests; clear them first.
  await prisma.generationJob.deleteMany({ where: { status: { in: ['queued', 'running'] } } });
}, JOB_SUITE_LOCK_WAIT_MS);

beforeEach(async () => {
  await prisma.generationJob.deleteMany({ where: { status: { in: ['queued', 'running'] } } });
});

afterAll(async () => {
  // Users cascade to cvs and jobs.
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  await prisma.$disconnect();
  await suite.release();
});

describe('C-005 / ADR-004: leasing', () => {
  it('leases a queued job: running, attempt 1, leasedUntil in the future', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    const { pipeline } = fakePipeline();
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000 });

    const lease = await worker.claimNext();

    expect(lease?.id).toBe(jobId);
    const job = await row(jobId);
    expect(job.status).toBe('running');
    expect(job.attempt).toBe(1);
    expect(job.leasedUntil).not.toBeNull();
    expect(job.leasedUntil!.getTime()).toBeGreaterThan(Date.now() + 30_000);
    worker.stop();
  });

  it('returns null when nothing is queued or reclaimable', async () => {
    const { pipeline } = fakePipeline();
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000 });

    expect(await worker.claimNext()).toBeNull();
    worker.stop();
  });

  it('two workers claiming at the same instant never get the same job (SKIP LOCKED)', async () => {
    const seed = await seedCv();
    const first = await seedJob(seed);
    const seedB = await seedCv();
    const second = await seedJob(seedB);
    const { pipeline: pA } = fakePipeline();
    const { pipeline: pB } = fakePipeline();
    const { pipeline: pC } = fakePipeline();
    const a = createJobWorker({ prisma, pipeline: pA, workerId: 'A', leaseMs: 60_000 });
    const b = createJobWorker({ prisma, pipeline: pB, workerId: 'B', leaseMs: 60_000 });
    const c = createJobWorker({ prisma, pipeline: pC, workerId: 'C', leaseMs: 60_000 });

    const results = await Promise.all([a.claimNext(), b.claimNext(), c.claimNext()]);

    const ids = results.filter((r) => r !== null).map((r) => r!.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids)).toEqual(new Set([first, second]));
    expect(results.filter((r) => r === null)).toHaveLength(1);
    a.stop();
    b.stop();
    c.stop();
  });

  it('skips a row another transaction holds locked instead of waiting on it', async () => {
    const seedA = await seedCv();
    const locked = await seedJob(seedA);
    const seedB = await seedCv();
    const free = await seedJob(seedB);
    const { pipeline } = fakePipeline();
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000 });

    const claimed = await prisma.$transaction(async (tx) => {
      // Hold the row lock on the older job from a different connection.
      await tx.$queryRaw`SELECT id FROM generation_jobs WHERE id = ${locked}::uuid FOR UPDATE`;
      return worker.claimNext();
    }, { timeout: 5000 });

    expect(claimed?.id).toBe(free);
    expect((await row(locked)).status).toBe('queued');
    worker.stop();
  }, 10_000);

  it('does not reclaim a running job whose lease is still live', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed, {
      status: 'running',
      stage: 'composing',
      attempt: 1,
      leasedUntil: new Date(Date.now() + 60_000),
      startedAt: new Date(),
    });
    const { pipeline } = fakePipeline();
    const worker = createJobWorker({ prisma, pipeline, workerId: 'B', leaseMs: 60_000 });

    expect(await worker.claimNext()).toBeNull();
    const job = await row(jobId);
    expect(job.attempt).toBe(1);
    expect(job.status).toBe('running');
    worker.stop();
  });
});

describe('C-005 / ADR-004: lease renewal and dead-worker reclaim', () => {
  it('renews leasedUntil while the pipeline is still running', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    const { pipeline } = fakePipeline({ extract: () => sleep(900) });
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 600 });

    const run = worker.runOnce();
    // Past the original 600 ms lease: only renewal keeps leasedUntil in the future.
    await sleep(700);
    const midRun = await row(jobId);
    expect(midRun.status).toBe('running');
    expect(midRun.leasedUntil!.getTime()).toBeGreaterThan(Date.now());

    expect(await run).toBe(jobId);
    expect((await row(jobId)).status).toBe('succeeded');
    worker.stop();
  });

  it('reclaims a job whose lease expired (dead worker), retries once and succeeds', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed, {
      status: 'running',
      stage: 'extracting',
      attempt: 1,
      leasedUntil: new Date(Date.now() - 60_000),
      startedAt: new Date(Date.now() - 120_000),
    });
    const { pipeline, calls } = fakePipeline();
    const survivor = createJobWorker({ prisma, pipeline, workerId: 'B', leaseMs: 60_000 });

    expect(await survivor.runOnce()).toBe(jobId);

    const job = await row(jobId);
    expect(job.attempt).toBe(2);
    expect(job.status).toBe('succeeded');
    expect(job.finishedAt).not.toBeNull();
    expect(calls).toEqual(['extract', 'compose', 'verify']);
    survivor.stop();
  });

  it('an expired lease on a job already at attempt 2 fails it and does not run the pipeline', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed, {
      status: 'running',
      stage: 'composing',
      attempt: 2,
      leasedUntil: new Date(Date.now() - 60_000),
      startedAt: new Date(Date.now() - 120_000),
    });
    const { pipeline, calls } = fakePipeline();
    const worker = createJobWorker({ prisma, pipeline, workerId: 'B', leaseMs: 60_000 });

    await worker.runOnce();

    const job = await row(jobId);
    expect(job.status).toBe('failed');
    expect(job.attempt).toBe(3);
    expect(job.errorCode).not.toBeNull();
    expect(job.finishedAt).not.toBeNull();
    expect(calls).toEqual([]);
    worker.stop();
  });
});

describe('C-005 / ADR-004: restart mid-run', () => {
  it('a worker that dies mid-run is replaced by a fresh one that completes the job', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);

    // Worker A stalls in extract forever, then "dies": stop() halts its renewals.
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => (releaseA = resolve));
    const a = fakePipeline({ extract: () => gateA });
    const workerA = createJobWorker({ prisma, pipeline: a.pipeline, workerId: 'A', leaseMs: 300 });
    const runA = workerA.runOnce();
    await waitFor(async () => (await row(jobId)).status === 'running');
    workerA.stop();

    // Lease lapses with nobody renewing it.
    await sleep(450);

    const b = fakePipeline();
    const workerB = createJobWorker({ prisma, pipeline: b.pipeline, workerId: 'B', leaseMs: 60_000 });
    expect(await workerB.runOnce()).toBe(jobId);

    const job = await row(jobId);
    expect(job.status).toBe('succeeded');
    expect(job.attempt).toBe(2);
    expect(a.calls).toEqual(['extract']);
    expect(b.calls).toEqual(['extract', 'compose', 'verify']);

    // The stale worker wakes up after the takeover and must not overwrite the terminal row.
    const finishedAt = job.finishedAt!.getTime();
    releaseA();
    await runA;
    const after = await row(jobId);
    expect(after.status).toBe('succeeded');
    expect(after.attempt).toBe(2);
    expect(after.finishedAt!.getTime()).toBe(finishedAt);
    expect(after.errorCode).toBeNull();
    workerB.stop();
  }, 15_000);

  it('the job row, not the worker, carries the state: a new worker sees the stage the old one wrote', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => (releaseA = resolve));
    const a = fakePipeline({ compose: () => gateA });
    const workerA = createJobWorker({ prisma, pipeline: a.pipeline, workerId: 'A', leaseMs: 300 });
    const runA = workerA.runOnce();
    await waitFor(async () => (await row(jobId)).stage === 'composing');
    workerA.stop();

    const persisted = await row(jobId);
    expect(persisted.status).toBe('running');
    expect(persisted.stage).toBe('composing');
    expect(persisted.attempt).toBe(1);
    releaseA();
    await runA.catch(() => undefined);
  }, 15_000);
});

describe('C-005 / ADR-003: stages, inputs and classified errors', () => {
  it('writes stage extracting before extract and composing before compose', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    const stagesSeen: (string | null)[] = [];
    const { pipeline } = fakePipeline({
      extract: async () => {
        stagesSeen.push((await row(jobId)).stage);
      },
      compose: async () => {
        stagesSeen.push((await row(jobId)).stage);
      },
    });
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000 });

    await worker.runOnce();

    expect(stagesSeen).toEqual(['extracting', 'composing']);
    worker.stop();
  });

  it('hands the pipeline the CV own sourceText and targetRole, and compose the extracted facts', async () => {
    const seed = await seedCv();
    await seedJob(seed);
    const { pipeline, extractArgs, composeArgs } = fakePipeline();
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000 });

    await worker.runOnce();

    expect(extractArgs).toEqual([seed.sourceText]);
    expect(composeArgs).toEqual([{ facts: [{ ...FACT, id: composeArgs[0].facts[0].id }], targetRole: seed.targetRole }]);
    worker.stop();
  });

  it('a pipeline error with a known code is recorded as that code and its message', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    const { pipeline } = fakePipeline({
      extract: async () => {
        throw Object.assign(new Error('model unreachable'), { code: 'LLM_UNAVAILABLE' });
      },
    });
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000 });

    await worker.runOnce();

    const job = await row(jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('LLM_UNAVAILABLE');
    expect(job.errorMessage).toBe('model unreachable');
    expect(job.finishedAt).not.toBeNull();
    worker.stop();
  });

  it('an unclassified pipeline error becomes INTERNAL, with no stack trace in the message', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    const { pipeline } = fakePipeline({
      compose: async () => {
        throw new Error('unexpected token at position 42');
      },
    });
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000 });

    await worker.runOnce();

    const job = await row(jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('INTERNAL');
    expect(job.errorMessage).not.toMatch(/\n\s+at /);
    worker.stop();
  });

  it('reports the error class, code, job id and attempt of an INTERNAL failure, never its message', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    const { pipeline } = fakePipeline({
      compose: async () => {
        throw Object.assign(new Error('secret driver detail postgres://u:p@host'), { name: 'DriverError', code: 'P2002' });
      },
    });
    const seen: unknown[] = [];
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000, onError: (i) => seen.push(i) });

    await worker.runOnce();

    expect(seen).toEqual([{ event: 'internal', jobId, attempt: 1, errorName: 'DriverError', errorCode: 'P2002' }]);
    expect(JSON.stringify(seen)).not.toContain('secret');
    worker.stop();
  });
});

describe('C-005 / domain-model GenerationJob: 180 s budget', () => {
  it('the default budget is 180 000 ms', () => {
    expect(JOB_BUDGET_MS).toBe(180_000);
  });

  it('a job that exceeds its budget fails with JOB_TIMEOUT instead of hanging', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { pipeline } = fakePipeline({ extract: () => gate });
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000, budgetMs: 300 });

    const started = Date.now();
    await worker.runOnce();
    const elapsed = Date.now() - started;

    const job = await row(jobId);
    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe('JOB_TIMEOUT');
    expect(elapsed).toBeLessThan(2000);
    expect(job.finishedAt!.getTime() - job.startedAt!.getTime()).toBeLessThanOrEqual(2000);
    worker.stop();
    release();
  });

  it('a pipeline that answers after the timeout does not revive the failed job', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { pipeline } = fakePipeline({ extract: () => gate });
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000, budgetMs: 300 });
    await worker.runOnce();
    const timedOut = await row(jobId);

    release();
    await sleep(200);

    const after = await row(jobId);
    expect(after.status).toBe('failed');
    expect(after.errorCode).toBe('JOB_TIMEOUT');
    expect(after.finishedAt!.getTime()).toBe(timedOut.finishedAt!.getTime());
    worker.stop();
  });
});

describe('domain-model GenerationJob: terminal immutability', () => {
  it('a succeeded job is not run again and its row does not change', async () => {
    const seed = await seedCv();
    const jobId = await seedJob(seed);
    const { pipeline, calls } = fakePipeline();
    const worker = createJobWorker({ prisma, pipeline, workerId: 'A', leaseMs: 60_000 });
    await worker.runOnce();
    const before = await row(jobId);
    const callsBefore = calls.length;

    expect(await worker.runOnce()).toBeNull();

    const after = await row(jobId);
    expect(after.status).toBe('succeeded');
    expect(after.attempt).toBe(before.attempt);
    expect(after.finishedAt!.getTime()).toBe(before.finishedAt!.getTime());
    expect(calls.length).toBe(callsBefore);
    worker.stop();
  });
});
