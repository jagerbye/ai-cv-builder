import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS, type JobTestSuite } from '../../api/src/core/jobs/test-lock.js';
import { createJobWorker } from '../../api/src/core/jobs/worker.js';
import type { Fact, GenerationPipeline } from '../../api/src/core/generation/types.js';
import {
  prisma,
  userIds,
  seedUser,
  seedCv,
  fakePipeline,
  getCv,
  regenerate,
  type Owner,
} from './generation-persist.fixtures.js';

// ADR-017 (sprint 001, lane F). A CV in state failed carries lastError { code, message } in C-006, read from
// the CV's own columns (last_error_code, last_error_message), written by the same transaction that sets the
// state to failed. code is from the C-000 enum; message is the fixed safe string that errors.ts owns for that
// code. The thrown error's own text never reaches the response. Real Postgres and Fastify; the LLM is the C-012 seam.

const suite: JobTestSuite = openJobTestSuite(prisma);
let app: FastifyInstance;
const { buildServer } = await import('../../api/src/server.js');

const TOKEN_A = 'lasterr-run-a';
const TOKEN_B = 'lasterr-run-b';
const LEASE_MS = 300_000;

// Fixed safe messages, copied from api/src/http/errors.ts DEFAULT_MESSAGE. Literal on purpose: the test
// must fail if the message the CV carries drifts from the one errors.ts owns.
const LLM_UNAVAILABLE_MESSAGE = 'The generation service is unavailable. Try again later.';
const JOB_TIMEOUT_MESSAGE = 'The job took too long and was stopped.';
const INTERNAL_MESSAGE = 'Something went wrong on our side.';

const LEAK = 'sk-ant-LEAK-do-not-return';

function workerFor(pipeline: GenerationPipeline, workerId: string, budgetMs?: number) {
  return createJobWorker({ prisma, pipeline, workerId, leaseMs: LEASE_MS, budgetMs });
}

async function runOne(pipeline: GenerationPipeline, workerId = 'lasterr'): Promise<string | null> {
  const worker = workerFor(pipeline, workerId);
  const ran = await worker.runOnce();
  worker.stop();
  return ran;
}

async function enqueueFresh(owner: Owner, cvId: string): Promise<string> {
  await suite.clearOpenJobs();
  return suite.enqueue({ cvId, userId: owner.userId, status: 'queued' });
}

// A pipeline whose extract stage throws the given error.
function throwingAt(token: string, err: unknown): GenerationPipeline {
  return {
    ...fakePipeline(token),
    extract: async (): Promise<Fact[]> => {
      throw err;
    },
  };
}

function classifiedFailure(token: string): GenerationPipeline {
  return throwingAt(token, Object.assign(new Error('model unreachable'), { code: 'LLM_UNAVAILABLE' }));
}

// The CV's own columns, as the state write leaves them.
async function cvRow(cvId: string) {
  return prisma.cv.findUniqueOrThrow({
    where: { id: cvId },
    select: { state: true, version: true, lastErrorCode: true, lastErrorMessage: true },
  });
}

// A CV whose first generation has failed with a classified error, so it is in state failed with lastError set.
async function failedFirstGeneration(owner: Owner): Promise<string> {
  const cvId = await seedCv(owner.userId);
  await enqueueFresh(owner, cvId);
  expect(await runOne(classifiedFailure(TOKEN_A))).not.toBeNull();
  return cvId;
}

beforeAll(async () => {
  await suite.lock();
  app = buildServer({ generationPipeline: fakePipeline('unused-by-route') });
  await app.ready();
}, JOB_SUITE_LOCK_WAIT_MS);

afterEach(async () => {
  const ids = userIds.splice(0);
  if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await suite.release();
});

describe('ADR-017: the CV schema holds its own last error, nullable, outside generation_jobs', () => {
  it('cvs has last_error_code and last_error_message as nullable text columns', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string; is_nullable: string; data_type: string }[]>`
      SELECT column_name, is_nullable, data_type FROM information_schema.columns
      WHERE table_name = 'cvs' AND column_name IN ('last_error_code', 'last_error_message')
      ORDER BY column_name`;
    expect(cols).toEqual([
      { column_name: 'last_error_code', is_nullable: 'YES', data_type: 'text' },
      { column_name: 'last_error_message', is_nullable: 'YES', data_type: 'text' },
    ]);
  });
});

describe('ADR-017: a failed CV carries lastError through C-006, per terminal path', () => {
  it('a classified failure on a first generation sets the code and the fixed message on the CV and in C-006', async () => {
    const owner = await seedUser();
    const cvId = await failedFirstGeneration(owner);

    expect(await cvRow(cvId)).toEqual({
      state: 'failed',
      version: 1,
      lastErrorCode: 'LLM_UNAVAILABLE',
      lastErrorMessage: LLM_UNAVAILABLE_MESSAGE,
    });
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.state).toBe('failed');
    expect(cv.lastError).toEqual({ code: 'LLM_UNAVAILABLE', message: LLM_UNAVAILABLE_MESSAGE });
  });

  it('a budget timeout sets JOB_TIMEOUT with the errors.ts message, not the worker-internal timeout text', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await enqueueFresh(owner, cvId);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const hung: GenerationPipeline = { ...fakePipeline(TOKEN_A), extract: () => gate.then(() => []) };

    const worker = workerFor(hung, 'lasterr-timeout', 300);
    expect(await worker.runOnce()).toBe(jobId);
    worker.stop();
    release();

    expect(await cvRow(cvId)).toMatchObject({ state: 'failed', lastErrorCode: 'JOB_TIMEOUT', lastErrorMessage: JOB_TIMEOUT_MESSAGE });
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.lastError).toEqual({ code: 'JOB_TIMEOUT', message: JOB_TIMEOUT_MESSAGE });
  });

  it('an exhausted lease (attempts used up) sets INTERNAL with the errors.ts message', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await suite.clearOpenJobs();
    await suite.enqueue({
      cvId,
      userId: owner.userId,
      status: 'running',
      stage: 'composing',
      attempt: 2,
      leasedUntil: new Date(Date.now() - 60_000),
      startedAt: new Date(Date.now() - 120_000),
    });

    expect(await runOne(fakePipeline(TOKEN_B))).toBeNull();

    expect(await cvRow(cvId)).toMatchObject({ state: 'failed', lastErrorCode: 'INTERNAL', lastErrorMessage: INTERNAL_MESSAGE });
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.lastError).toEqual({ code: 'INTERNAL', message: INTERNAL_MESSAGE });
  });

  it('a failed regeneration sets lastError and keeps the content the user was looking at', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await enqueueFresh(owner, cvId);
    expect(await runOne(fakePipeline(TOKEN_A))).not.toBeNull();
    const res = await regenerate(app, owner.cookie, cvId);
    expect(res.statusCode, res.body).toBe(202);

    expect(await runOne(classifiedFailure(TOKEN_B))).not.toBeNull();

    expect(await cvRow(cvId)).toEqual({
      state: 'failed',
      version: 2,
      lastErrorCode: 'LLM_UNAVAILABLE',
      lastErrorMessage: LLM_UNAVAILABLE_MESSAGE,
    });
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.lastError).toEqual({ code: 'LLM_UNAVAILABLE', message: LLM_UNAVAILABLE_MESSAGE });
    expect(cv.summary.text).toBe(`Summary ${TOKEN_A}`);
  });
});

describe('ADR-017: the thrown error text never reaches the response', () => {
  it('a classified error whose own message carries a secret and a host reaches C-006 only as the fixed message', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await enqueueFresh(owner, cvId);
    const leaky = throwingAt(TOKEN_A, Object.assign(new Error(`auth failed for ${LEAK} at https://llm.internal.example`), { code: 'LLM_UNAVAILABLE' }));
    expect(await runOne(leaky)).not.toBeNull();

    const res = await getCv(app, owner.cookie, cvId);
    expect(res.body).not.toContain(LEAK);
    expect(res.body).not.toContain('llm.internal.example');
    expect(res.json().lastError).toEqual({ code: 'LLM_UNAVAILABLE', message: LLM_UNAVAILABLE_MESSAGE });
    const row = await prisma.cv.findUniqueOrThrow({ where: { id: cvId }, select: { lastErrorMessage: true } });
    expect(row.lastErrorMessage).not.toContain(LEAK);
  });

  it('an error outside the C-000 enum, or a parser message with no code, becomes INTERNAL and its text stays out', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await enqueueFresh(owner, cvId);
    const driver = throwingAt(TOKEN_A, Object.assign(new Error(`connect ECONNREFUSED ${LEAK}`), { code: 'ECONNREFUSED' }));
    expect(await runOne(driver)).not.toBeNull();

    const res = await getCv(app, owner.cookie, cvId);
    expect(res.body).not.toContain(LEAK);
    expect(res.body).not.toContain('ECONNREFUSED');
    expect(res.json().lastError).toEqual({ code: 'INTERNAL', message: INTERNAL_MESSAGE });
  });
});

describe('ADR-017: lastError is absent in every state other than failed', () => {
  it('a CV that succeeded has no lastError key and null columns', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await enqueueFresh(owner, cvId);
    expect(await runOne(fakePipeline(TOKEN_A))).not.toBeNull();

    expect(await cvRow(cvId)).toMatchObject({ state: 'ready', lastErrorCode: null, lastErrorMessage: null });
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.state).toBe('ready');
    expect(cv).not.toHaveProperty('lastError');
  });

  it('a stale last error column on a CV that is not failed is not shown in C-006', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await prisma.cv.update({
      where: { id: cvId },
      data: { state: 'generating', lastErrorCode: 'LLM_UNAVAILABLE', lastErrorMessage: LLM_UNAVAILABLE_MESSAGE },
    });

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.state).toBe('generating');
    expect(cv).not.toHaveProperty('lastError');
  });
});

describe('ADR-017: a successful regeneration clears the last error', () => {
  it('regenerating a failed CV drops lastError at once, and the successful run leaves it absent', async () => {
    const owner = await seedUser();
    const cvId = await failedFirstGeneration(owner);

    const res = await regenerate(app, owner.cookie, cvId);
    expect(res.statusCode, res.body).toBe(202);

    expect(await cvRow(cvId)).toEqual({ state: 'generating', version: 1, lastErrorCode: null, lastErrorMessage: null });
    const queued = (await getCv(app, owner.cookie, cvId)).json();
    expect(queued.state).toBe('generating');
    expect(queued).not.toHaveProperty('lastError');

    expect(await runOne(fakePipeline(TOKEN_B))).not.toBeNull();

    expect(await cvRow(cvId)).toEqual({ state: 'ready', version: 2, lastErrorCode: null, lastErrorMessage: null });
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.state).toBe('ready');
    expect(cv).not.toHaveProperty('lastError');
    expect(cv.summary.text).toBe(`Summary ${TOKEN_B}`);
  });
});

describe('ADR-017: the CV outlives its jobs', () => {
  it('lastError is still on the CV after the job rows that failed are gone', async () => {
    const owner = await seedUser();
    const cvId = await failedFirstGeneration(owner);
    await prisma.generationJob.deleteMany({ where: { cvId } });

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.lastError).toEqual({ code: 'LLM_UNAVAILABLE', message: LLM_UNAVAILABLE_MESSAGE });
  });
});
