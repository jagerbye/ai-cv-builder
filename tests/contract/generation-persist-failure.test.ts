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
  getJob,
  regenerate,
  itemsOf,
  type Owner,
} from './generation-persist.fixtures.js';

// QA-10 (sprint 01). A terminal failure of a run (classified error, budget timeout, attempts exhausted)
// moves the CV to state 'failed' in the same fenced write that writes the job row (C-005 / C-006), and
// keeps every piece of content the CV already had. A regeneration that fails must not wipe the draft.
// Real Postgres and Fastify; the LLM is the C-012 seam.

const suite: JobTestSuite = openJobTestSuite(prisma);
let app: FastifyInstance;
const { buildServer } = await import('../../api/src/server.js');

const TOKEN_A = 'fail-run-a';
const TOKEN_B = 'fail-run-b';
const SUCCESSOR = 'fail-successor';
const ZOMBIE = 'fail-zombie';
const LEASE_MS = 300_000;

function workerFor(pipeline: GenerationPipeline, workerId: string, budgetMs?: number) {
  return createJobWorker({ prisma, pipeline, workerId, leaseMs: LEASE_MS, budgetMs });
}

// Runs one claim to a terminal state and returns the id the worker ran (null when none was claimable).
async function runOne(pipeline: GenerationPipeline, workerId = 'qa-10'): Promise<string | null> {
  const worker = workerFor(pipeline, workerId);
  const ran = await worker.runOnce();
  worker.stop();
  return ran;
}

// Clears other suites' open rows (under the suite lock) and queues a fresh job for this CV.
async function enqueueFresh(owner: Owner, cvId: string): Promise<string> {
  await suite.clearOpenJobs();
  return suite.enqueue({ cvId, userId: owner.userId, status: 'queued' });
}

// A pipeline whose extract stage fails with a classified C-000 code (the LLM is unavailable).
function classifiedFailure(token: string): GenerationPipeline {
  return {
    ...fakePipeline(token),
    extract: async (): Promise<Fact[]> => {
      throw Object.assign(new Error('model unreachable'), { code: 'LLM_UNAVAILABLE' });
    },
  };
}

// Every stored item, reduced to the fields a user would see or a later run could change.
async function snapshotItems(cvId: string) {
  return (await itemsOf(cvId)).map((i) => ({ id: i.id, kind: i.kind, path: i.path, parentId: i.parentId, data: i.data, userEdited: i.userEdited }));
}

// A CV that already holds a successful generation (state ready, version 2 after a regeneration) and is
// now being regenerated: the state is generating, the draft from run A is still stored.
async function readyCvThenRegenerating(owner: Owner): Promise<string> {
  const cvId = await seedCv(owner.userId);
  const first = await enqueueFresh(owner, cvId);
  expect(await runOne(fakePipeline(TOKEN_A))).toBe(first);
  const res = await regenerate(app, owner.cookie, cvId);
  expect(res.statusCode, res.body).toBe(202);
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

describe('QA-10: a classified failure on a first generation moves the CV to failed', () => {
  it('the CV reads state failed through C-006, version unchanged, and the job reads failed with its code through C-005', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await enqueueFresh(owner, cvId);

    expect(await runOne(classifiedFailure(TOKEN_A))).toBe(jobId);

    const row = await prisma.cv.findUniqueOrThrow({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'failed', version: 1 });
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.state).toBe('failed');
    const job = (await getJob(app, owner.cookie, jobId)).json();
    expect(job).toMatchObject({ status: 'failed', error: { code: 'LLM_UNAVAILABLE', message: 'model unreachable' } });
  });

  it('keeps the intake contact: a failed first run stores no draft and does not wipe the source-derived contact', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await enqueueFresh(owner, cvId);

    await runOne(classifiedFailure(TOKEN_A));

    expect((await snapshotItems(cvId)).map((i) => i.kind)).toEqual(['contact']);
    expect((await getCv(app, owner.cookie, cvId)).json().contact.fullName).toBe('Ada Lovelace');
  });
});

describe('QA-10: a failed regeneration keeps the draft the user was looking at', () => {
  it('state goes to failed, every stored item survives unchanged, and the version does not bump', async () => {
    const owner = await seedUser();
    const cvId = await readyCvThenRegenerating(owner);
    const before = await snapshotItems(cvId);
    expect(before.length).toBeGreaterThan(1);

    const queued = await prisma.generationJob.findFirst({ where: { cvId, status: 'queued' }, select: { id: true } });
    expect(queued).not.toBeNull();

    expect(await runOne(classifiedFailure(TOKEN_B))).toBe(queued!.id);

    const row = await prisma.cv.findUniqueOrThrow({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'failed', version: 2 });
    expect(await snapshotItems(cvId)).toEqual(before);

    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.state).toBe('failed');
    expect(cv.summary.text).toBe(`Summary ${TOKEN_A}`);
    expect(cv.experience.map((e: any) => e.employer)).toEqual([`Employer ${TOKEN_A} A`, `Employer ${TOKEN_A} B`]);
    expect(cv.skills.map((s: any) => s.name)).toEqual([`TypeScript ${TOKEN_A}`, `PostgreSQL ${TOKEN_A}`]);
    expect(cv.contact.fullName).toBe('Ada Lovelace');
    expect(JSON.stringify(cv)).not.toContain(TOKEN_B);
  });
});

describe('QA-10: a budget timeout moves the CV to failed and keeps its content', () => {
  it('a first generation that times out leaves the CV failed with only the contact stored', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await enqueueFresh(owner, cvId);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const hung: GenerationPipeline = { ...fakePipeline(TOKEN_A), extract: () => gate.then(() => []) };

    const worker = workerFor(hung, 'qa-10-timeout', 300);
    expect(await worker.runOnce()).toBe(jobId);
    worker.stop();
    release();

    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ status: 'failed', errorCode: 'JOB_TIMEOUT' });
    const row = await prisma.cv.findUniqueOrThrow({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'failed', version: 1 });
    expect((await snapshotItems(cvId)).map((i) => i.kind)).toEqual(['contact']);
  });

  it('a regeneration that times out leaves the CV failed and every stored item unchanged', async () => {
    const owner = await seedUser();
    const cvId = await readyCvThenRegenerating(owner);
    const before = await snapshotItems(cvId);
    const queued = await prisma.generationJob.findFirstOrThrow({ where: { cvId, status: 'queued' }, select: { id: true } });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const hung: GenerationPipeline = { ...fakePipeline(TOKEN_B), extract: () => gate.then(() => []) };

    const worker = workerFor(hung, 'qa-10-timeout-regen', 300);
    expect(await worker.runOnce()).toBe(queued.id);
    worker.stop();
    release();

    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: queued.id } });
    expect(job).toMatchObject({ status: 'failed', errorCode: 'JOB_TIMEOUT' });
    const row = await prisma.cv.findUniqueOrThrow({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'failed', version: 2 });
    expect(await snapshotItems(cvId)).toEqual(before);
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.summary.text).toBe(`Summary ${TOKEN_A}`);
    expect(JSON.stringify(cv)).not.toContain(TOKEN_B);
  });
});

describe('QA-10: an exhausted lease (attempts used up) moves the CV to failed and keeps its content', () => {
  it('a job whose second attempt expired is failed at claim time, the CV is failed, and the draft survives', async () => {
    const owner = await seedUser();
    const cvId = await readyCvThenRegenerating(owner);
    const before = await snapshotItems(cvId);
    await suite.clearOpenJobs();
    const jobId = await suite.enqueue({
      cvId,
      userId: owner.userId,
      status: 'running',
      stage: 'composing',
      attempt: 2,
      leasedUntil: new Date(Date.now() - 60_000),
      startedAt: new Date(Date.now() - 120_000),
    });

    // The exhausted row is failed by claimNext, so no pipeline runs and nothing is claimable.
    expect(await runOne(fakePipeline(TOKEN_B))).toBeNull();

    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ status: 'failed', attempt: 3, errorCode: 'INTERNAL' });
    const row = await prisma.cv.findUniqueOrThrow({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'failed', version: 2 });
    expect(await snapshotItems(cvId)).toEqual(before);
    expect((await getCv(app, owner.cookie, cvId)).json().summary.text).toBe(`Summary ${TOKEN_A}`);
  });
});

describe('QA-10 fence: a zombie run that fails after a successor took its job does not flip the CV', () => {
  it('the successor draft stays, the CV stays ready, and the zombie classified failure writes nothing', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await enqueueFresh(owner, cvId);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const zombiePipeline: GenerationPipeline = {
      ...fakePipeline(ZOMBIE),
      extract: () =>
        gate.then(() => {
          throw Object.assign(new Error('model unreachable'), { code: 'LLM_UNAVAILABLE' });
        }),
    };
    const zombie = workerFor(zombiePipeline, 'zombie');
    const zombieRun = zombie.runOnce();

    // Wait until the zombie holds the row and has written its first stage.
    for (let i = 0; i < 300; i++) {
      const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId }, select: { stage: true } });
      if (row.stage === 'extracting') break;
      await new Promise((r) => setTimeout(r, 10));
    }
    await suite.expireLease(jobId);

    expect(await runOne(fakePipeline(SUCCESSOR), 'successor')).toBe(jobId);
    release();
    expect(await zombieRun).toBe(jobId);
    zombie.stop();

    const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job).toMatchObject({ status: 'succeeded', attempt: 2, errorCode: null });
    const row = await prisma.cv.findUniqueOrThrow({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'ready', version: 2 });
    expect((await getCv(app, owner.cookie, cvId)).json().summary.text).toBe(`Summary ${SUCCESSOR}`);
    expect(JSON.stringify(await snapshotItems(cvId))).not.toContain(ZOMBIE);
  });
});
