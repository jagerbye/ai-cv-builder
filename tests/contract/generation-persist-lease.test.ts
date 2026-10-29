import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS, type JobTestSuite } from '../../api/src/core/jobs/test-lock.js';
import { createJobWorker } from '../../api/src/core/jobs/worker.js';
import {
  prisma,
  userIds,
  seedUser,
  seedCv,
  fakePipeline,
  getCv,
  getJob,
  gatedPrisma,
  itemsOf,
  type Owner,
} from './generation-persist.fixtures.js';

// T-28 (CVB-31). The fence on the persist transaction. A worker whose lease a successor took must
// store nothing: the draft write and the job's success write are one transaction, and the job row
// update (id, attempt, status='running') must match, or the whole transaction rolls back.
//
// The zombie is a run that is still executing (not stopped, its in-memory state says it owns the
// job) when its lease expires and a successor claims the row. Its last stage write has landed, so
// only the persist fence can stop it. The persist transaction is held open by the gated client
// until the successor has finished, then released. A persist that ignores the fence (or writes
// before the fence) stores the zombie draft after the successor's, and every assertion below fails.

const suite: JobTestSuite = openJobTestSuite(prisma);
let app: FastifyInstance;
const { buildServer } = await import('../../api/src/server.js');

const ZOMBIE = 'zombie-run';
const SUCCESSOR = 'successor-run';
const LEASE_MS = 300_000;

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

// Shared scenario. The zombie starts, is held at its persist transaction, its lease is expired, a
// successor runs the job to the end, and only then is the zombie's transaction released.
async function runWithZombieHeld(opts: { stopZombie: boolean }) {
  const owner: Owner = await seedUser();
  const cvId = await seedCv(owner.userId);
  // claimNext is global: a foreign queued or running row left by another suite would be claimed instead of ours.
  await suite.clearOpenJobs();
  const jobId = await suite.enqueue({ cvId, userId: owner.userId, status: 'queued' });

  const gated = gatedPrisma(prisma);
  const zombie = createJobWorker({
    prisma: gated.client,
    pipeline: fakePipeline(ZOMBIE),
    workerId: 'zombie',
    leaseMs: LEASE_MS,
  });
  const zombieRun = zombie.runOnce();

  // Either the zombie's persist is held at the gate, or the zombie finished without ever reaching a
  // transaction (a persist that writes outside one). The second outcome is already a failure below.
  const reached = await Promise.race([gated.held.then(() => 'held' as const), zombieRun.then(() => 'finished' as const)]);

  if (opts.stopZombie) zombie.stop();
  await suite.expireLease(jobId);

  const successor = createJobWorker({
    prisma,
    pipeline: fakePipeline(SUCCESSOR),
    workerId: 'successor',
    leaseMs: LEASE_MS,
  });
  const ranSuccessor = await successor.runOnce();

  gated.release();
  await zombieRun;
  await gated.settled();

  return { owner, cvId, jobId, reached, ranSuccessor };
}

describe('T-28 fence: a zombie run whose lease a successor took stores nothing', () => {
  it('after the successor finishes, exactly one draft is stored and it is the successor draft', async () => {
    const { owner, cvId, jobId, reached, ranSuccessor } = await runWithZombieHeld({ stopZombie: false });

    expect(reached).toBe('held');
    expect(ranSuccessor).toBe(jobId);

    // Exactly one draft: one summary, the successor's two experience rows, one skill set.
    const items = await itemsOf(cvId);
    expect(items.filter((i) => i.kind === 'summary')).toHaveLength(1);
    expect(items.filter((i) => i.kind === 'experience')).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'skill')).toHaveLength(2);
    expect(items.filter((i) => i.kind === 'education')).toHaveLength(1);

    // It is the successor's draft, never the zombie's.
    expect(JSON.stringify(items)).toContain(`Summary ${SUCCESSOR}`);
    expect(JSON.stringify(items)).not.toContain(ZOMBIE);
    const cv = (await getCv(app, owner.cookie, cvId)).json();
    expect(cv.summary.text).toBe(`Summary ${SUCCESSOR}`);
  });

  it('the job row is still the successor attempt: attempt 2, succeeded, and the zombie wrote no status over it', async () => {
    const { owner, jobId } = await runWithZombieHeld({ stopZombie: false });

    const row = await prisma.generationJob.findUnique({ where: { id: jobId } });
    expect(row).toMatchObject({ status: 'succeeded', attempt: 2, stage: null, errorCode: null });
    const job = (await getJob(app, owner.cookie, jobId)).json();
    expect(job).toMatchObject({ status: 'succeeded', attempt: 2 });
  });

  it('the CV version is bumped once, by the successor: the zombie adds no second bump', async () => {
    const { owner, cvId } = await runWithZombieHeld({ stopZombie: false });

    const row = await prisma.cv.findUnique({ where: { id: cvId }, select: { state: true, version: true } });
    expect(row).toEqual({ state: 'ready', version: 2 });
    expect((await getCv(app, owner.cookie, cvId)).json().version).toBe(2);
  });
});

describe('T-28 fence: a worker stopped mid-persist stores nothing, and the successor draft is the one kept', () => {
  it('after stop() and a successor run, exactly one draft is stored and it is the successor draft', async () => {
    const { owner, cvId, jobId, reached, ranSuccessor } = await runWithZombieHeld({ stopZombie: true });

    expect(reached).toBe('held');
    expect(ranSuccessor).toBe(jobId);

    const items = await itemsOf(cvId);
    expect(items.filter((i) => i.kind === 'summary')).toHaveLength(1);
    expect(items.filter((i) => i.kind === 'experience')).toHaveLength(2);
    expect(JSON.stringify(items)).toContain(`Summary ${SUCCESSOR}`);
    expect(JSON.stringify(items)).not.toContain(ZOMBIE);

    const row = await prisma.generationJob.findUnique({ where: { id: jobId } });
    expect(row).toMatchObject({ status: 'succeeded', attempt: 2 });
    expect((await getCv(app, owner.cookie, cvId)).json().version).toBe(2);
  });
});

describe('T-28 fence: the zombie without a successor still writes nothing for a job it no longer holds', () => {
  it('a stopped worker whose job was never reclaimed leaves the CV untouched after its run returns', async () => {
    const owner = await seedUser();
    const cvId = await seedCv(owner.userId);
    await suite.clearOpenJobs();
    const jobId = await suite.enqueue({ cvId, userId: owner.userId, status: 'queued' });

    const gated = gatedPrisma(prisma);
    const zombie = createJobWorker({ prisma: gated.client, pipeline: fakePipeline(ZOMBIE), workerId: 'zombie', leaseMs: LEASE_MS });
    const zombieRun = zombie.runOnce();
    await Promise.race([gated.held, zombieRun]);
    zombie.stop();
    gated.release();
    await zombieRun;
    await gated.settled();

    // Nothing reclaimed the row, so the fence still matches and the stopped worker must not persist.
    expect(JSON.stringify(await itemsOf(cvId))).not.toContain(ZOMBIE);
    const row = await prisma.generationJob.findUnique({ where: { id: jobId } });
    expect(row?.status).toBe('running');
    expect((await prisma.cv.findUnique({ where: { id: cvId }, select: { version: true } }))?.version).toBe(1);
  });
});
