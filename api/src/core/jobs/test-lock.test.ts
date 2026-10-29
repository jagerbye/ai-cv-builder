import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { acquireJobSuiteLock, openJobTestSuite, type JobTestSuite } from './test-lock.js';

// T-25 (CVB-28). ADR-014, E-002. openJobTestSuite(prisma) returns a suite whose enqueue() writes a
// generation_jobs row AND takes the job-suite lock itself, so a test cannot commit a job without the
// lock. Real Postgres throughout: the lock, the partial unique index and the rollback are database
// behaviour and are not mocked.
//
// Contract under test (test-lock.ts):
//   openJobTestSuite(prisma): JobTestSuite
//   JobTestSuite.enqueue(data, tx?): Promise<string>   takes the suite lock on first call, then inserts
//   JobTestSuite.holdsLock: boolean                    true only while this suite holds the lock
//   JobTestSuite.release(): Promise<void>              releases the lock if held; idempotent

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder';

// Same key as LOCK_KEY in test-lock.ts. Probed from a separate connection: advisory locks belong to a
// session, and a session may always re-take its own lock, so a same-session probe proves nothing.
// Other suites in the same run hold this lock too, so a probe can only say "someone holds it".
const SUITE_LOCK_KEY = 160016;
// Every case takes the real suite lock, which sibling suites hold for seconds during a parallel run
// (ADR-014). The default 5s test timeout would fail on contention, not on the helper.
const LOCK_WAIT_TIMEOUT = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const prisma = new PrismaClient();
const userIds: string[] = [];
const openSuites: JobTestSuite[] = [];

function openSuite(): JobTestSuite {
  const suite = openJobTestSuite(prisma);
  openSuites.push(suite);
  return suite;
}

async function lockHeldElsewhere(): Promise<boolean> {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder');
  url.searchParams.set('connection_limit', '1');
  const probe = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    const rows = await probe.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${SUITE_LOCK_KEY}) AS ok`;
    if (!rows[0]?.ok) return true;
    await probe.$queryRaw`SELECT pg_advisory_unlock(${SUITE_LOCK_KEY})`;
    return false;
  } finally {
    await probe.$disconnect();
  }
}

async function seedCv() {
  const userId = randomUUID();
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `lock-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  const cv = await prisma.cv.create({
    data: { userId, targetRole: 'Backend Engineer', sourceKind: 'text', sourceText: `lock ${userId}`, state: 'generating' },
  });
  return { userId, cvId: cv.id };
}

class Rollback extends Error {}

async function rolledBack(fn: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  await prisma
    .$transaction(async (tx) => {
      await fn(tx);
      throw new Rollback('rollback');
    })
    .catch((err: unknown) => {
      if (!(err instanceof Rollback)) throw err;
    });
}

afterEach(async () => {
  for (const suite of openSuites.splice(0)) await suite.release();
});

afterAll(async () => {
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('acquireJobSuiteLock (existing export, must not change)', () => {
  it('still takes the lock and releases it', { timeout: LOCK_WAIT_TIMEOUT }, async () => {
    const lock = await acquireJobSuiteLock();
    expect(await lockHeldElsewhere(), 'a second session cannot take the lock while it is held').toBe(true);
    await lock.release();
  });
});

describe('openJobTestSuite().enqueue writes the row it is given', () => {
  it('returns the id of a row that exists with the CV, user and status it was given', { timeout: LOCK_WAIT_TIMEOUT }, async () => {
    const { userId, cvId } = await seedCv();
    const suite = openSuite();
    const id = await suite.enqueue({ cvId, userId, status: 'queued' });
    expect(id).toMatch(UUID);
    const row = await prisma.generationJob.findUnique({ where: { id } });
    expect(row).toMatchObject({ cvId, userId, status: 'queued' });
  });

  it('writes attempt and stage as given, not as defaults', { timeout: LOCK_WAIT_TIMEOUT }, async () => {
    const { userId, cvId } = await seedCv();
    const suite = openSuite();
    const attempt = 1 + Math.floor(Math.random() * 9);
    const stage = `stage-${randomUUID()}`;
    const id = await suite.enqueue({ cvId, userId, status: 'running', attempt, stage });
    const row = await prisma.generationJob.findUnique({ where: { id } });
    expect(row?.attempt).toBe(attempt);
    expect(row?.stage).toBe(stage);
  });

  it('two enqueues on one suite both succeed (the lock is not taken twice)', { timeout: LOCK_WAIT_TIMEOUT }, async () => {
    // One in-flight job per CV (ADR-004): the second enqueue needs its own CV, or the partial index rejects it.
    const first_ = await seedCv();
    const second_ = await seedCv();
    const suite = openSuite();
    const first = await suite.enqueue({ cvId: first_.cvId, userId: first_.userId, status: 'queued' });
    await suite.release();
    const second = await suite.enqueue({ cvId: second_.cvId, userId: second_.userId, status: 'queued' });
    expect(second).not.toBe(first);
  });
});

describe('openJobTestSuite().enqueue takes the suite lock itself', () => {
  it('holds the lock after the first enqueue, with no separate acquire call', { timeout: LOCK_WAIT_TIMEOUT }, async () => {
    const { userId, cvId } = await seedCv();
    const suite = openSuite();
    expect(suite.holdsLock).toBe(false);
    await suite.enqueue({ cvId, userId, status: 'queued' });
    expect(suite.holdsLock).toBe(true);
    expect(await lockHeldElsewhere(), 'a second session cannot take the lock while this suite holds it').toBe(true);
  });

  it('release() drops the lock, and a second release() is a no-op', { timeout: LOCK_WAIT_TIMEOUT }, async () => {
    const { userId, cvId } = await seedCv();
    const suite = openSuite();
    await suite.enqueue({ cvId, userId, status: 'queued' });
    await suite.release();
    expect(suite.holdsLock).toBe(false);
    await expect(suite.release()).resolves.toBeUndefined();
  });
});

describe('openJobTestSuite().enqueue inside a caller transaction', () => {
  it('writes into the caller transaction: the row is gone after a rollback', { timeout: LOCK_WAIT_TIMEOUT }, async () => {
    const { userId, cvId } = await seedCv();
    const suite = openSuite();
    let inTx: string | undefined;
    await rolledBack(async (tx) => {
      inTx = await suite.enqueue({ cvId, userId, status: 'queued' }, tx);
      expect(await tx.generationJob.findUnique({ where: { id: inTx } })).not.toBeNull();
    });
    expect(inTx).toMatch(UUID);
    expect(await prisma.generationJob.findUnique({ where: { id: inTx! } })).toBeNull();
  });

  it('passes the database error through: a second in-flight job for one CV rejects with P2002', { timeout: LOCK_WAIT_TIMEOUT }, async () => {
    const { userId, cvId } = await seedCv();
    const suite = openSuite();
    await rolledBack(async (tx) => {
      await suite.enqueue({ cvId, userId, status: 'queued' }, tx);
      await expect(suite.enqueue({ cvId, userId, status: 'queued' }, tx)).rejects.toMatchObject({ code: 'P2002' });
    });
  });
});
