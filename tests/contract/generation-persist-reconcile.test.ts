import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS, type JobTestSuite } from '../../api/src/core/jobs/test-lock.js';
import { createJobWorker } from '../../api/src/core/jobs/worker.js';
import { ERROR_CODES } from '../../api/src/http/errors.js';
import type { GenerationPipeline } from '../../api/src/core/generation/types.js';
import { prisma, userIds, seedUser, seedCv } from './generation-persist.fixtures.js';

// QA-14. The QA-10 fix is forward-only: a CV left in `generating` by a crashed or killed worker, or by data
// from before the fix, has no job that will ever finish it. At worker startup such a CV is marked failed.
// The condition is structural: state generating AND no non-terminal job of its own. Never age, never a name
// pattern (E-005). Every assertion is on ids this test created.

const suite: JobTestSuite = openJobTestSuite(prisma);
// Every job id this file enqueues; afterEach deletes exactly these (E-005).
const jobIds: string[] = [];
const enqueue: JobTestSuite['enqueue'] = async (data, tx) => {
  const id = await suite.enqueue(data, tx);
  jobIds.push(id);
  return id;
};

// Never reached by these tests: no queued job of ours is claimable.
const idlePipeline: GenerationPipeline = {
  async extract() {
    throw new Error('not reached');
  },
  async compose() {
    throw new Error('not reached');
  },
  verify(accepted) {
    return { accepted, questions: [], dropped: [] };
  },
};

beforeAll(async () => {
  await suite.lock();
}, JOB_SUITE_LOCK_WAIT_MS);

afterEach(async () => {
  const jobs = jobIds.splice(0);
  if (jobs.length > 0) await prisma.generationJob.deleteMany({ where: { id: { in: jobs } } });
  const ids = userIds.splice(0);
  if (ids.length > 0) await prisma.user.deleteMany({ where: { id: { in: ids } } });
});

afterAll(async () => {
  await prisma.$disconnect();
  await suite.release();
});

const cvRow = (id: string) =>
  prisma.cv.findUniqueOrThrow({
    where: { id },
    select: { state: true, version: true, lastErrorCode: true, lastErrorMessage: true },
  });

async function seedScenario() {
  const owner = await seedUser();
  const terminalCv = await seedCv(owner.userId);
  await enqueue({
    cvId: terminalCv,
    userId: owner.userId,
    status: 'failed',
    finishedAt: new Date(),
    errorCode: 'INTERNAL',
    errorMessage: 'The generation failed.',
  });
  const noJobCv = await seedCv(owner.userId);
  const liveCv = await seedCv(owner.userId);
  const liveJob = await enqueue({ cvId: liveCv, userId: owner.userId, status: 'queued' });
  const runningCv = await seedCv(owner.userId);
  await enqueue({
    cvId: runningCv,
    userId: owner.userId,
    status: 'running',
    attempt: 1,
    startedAt: new Date(),
    leasedUntil: new Date(Date.now() + 300_000),
  });
  const ids = [terminalCv, noJobCv, liveCv, runningCv];
  return { terminalCv, noJobCv, liveCv, liveJob, runningCv, ids };
}

function expectOrphanFailed(row: Awaited<ReturnType<typeof cvRow>>) {
  expect(row.state).toBe('failed');
  expect(row.lastErrorCode).toBe('INTERNAL');
  expect((ERROR_CODES as readonly string[]).includes(row.lastErrorCode ?? '')).toBe(true);
  // A fixed safe sentence: it says what happened and what to do, and carries no provider or driver text.
  expect(row.lastErrorMessage).toBe('The generation was interrupted and did not finish. Regenerate to try again.');
  expect(row.version).toBe(1);
}

describe('QA-14 reconcile: a generating CV with no live job of its own', () => {
  it('worker.reconcile(ids) fails the terminal-job CV and the no-job CV, and leaves live jobs alone', async () => {
    const s = await seedScenario();
    const worker = createJobWorker({ prisma, pipeline: idlePipeline, workerId: 'reconcile-direct', leaseMs: 300_000 });

    const n = await worker.reconcile(s.ids);

    expect(n).toBe(2);
    expectOrphanFailed(await cvRow(s.terminalCv));
    expectOrphanFailed(await cvRow(s.noJobCv));
    expect(await cvRow(s.liveCv)).toEqual({ state: 'generating', version: 1, lastErrorCode: null, lastErrorMessage: null });
    expect(await cvRow(s.runningCv)).toMatchObject({ state: 'generating', lastErrorCode: null });
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: s.liveJob } })).status).toBe('queued');
  });

  it('is idempotent: a second run changes nothing, and a ready or failed CV is never touched', async () => {
    const owner = await seedUser();
    const orphanCv = await seedCv(owner.userId);
    const readyCv = await seedCv(owner.userId);
    await prisma.cv.update({ where: { id: readyCv }, data: { state: 'ready', version: 2 } });
    const failedCv = await seedCv(owner.userId);
    await prisma.cv.update({ where: { id: failedCv }, data: { state: 'failed', lastErrorCode: 'CONFIG_MISSING', lastErrorMessage: 'The server is not configured for this request.' } });
    const worker = createJobWorker({ prisma, pipeline: idlePipeline, workerId: 'reconcile-idem', leaseMs: 300_000 });

    const ids = [orphanCv, readyCv, failedCv];
    // The orphan is a generating CV with no job of its own: the first run fails it, the second finds nothing.
    expect(await worker.reconcile(ids)).toBe(1);
    expect(await worker.reconcile(ids)).toBe(0);

    expectOrphanFailed(await cvRow(orphanCv));
    expect(await cvRow(readyCv)).toMatchObject({ state: 'ready', version: 2, lastErrorCode: null });
    expect(await cvRow(failedCv)).toMatchObject({ state: 'failed', lastErrorCode: 'CONFIG_MISSING' });
  });
});
