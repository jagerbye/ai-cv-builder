import { PrismaClient, type Prisma } from '@prisma/client';

// Test-only. claimNext is global by design, so the three job suites must not overlap: each holds
// this session-level advisory lock for its whole run. A one-connection client keeps the session
// (and so the lock) on a single connection until release.
const LOCK_KEY = 160016;
export const JOB_SUITE_LOCK_WAIT_MS = 170_000;

export interface JobSuiteLock {
  release(): Promise<void>;
}

export async function acquireJobSuiteLock(): Promise<JobSuiteLock> {
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder');
  url.searchParams.set('connection_limit', '1');
  const client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const deadline = Date.now() + JOB_SUITE_LOCK_WAIT_MS - 5_000;
  for (;;) {
    const rows = await client.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS ok`;
    if (rows[0]?.ok) break;
    if (Date.now() > deadline) {
      await client.$disconnect();
      throw new Error('job suite lock: timed out waiting for another job suite');
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    async release() {
      await client.$queryRaw`SELECT pg_advisory_unlock(${LOCK_KEY})`;
      await client.$disconnect();
    },
  };
}

// A test's view of generation_jobs. enqueue() is the only way a test commits a non-terminal row:
// it takes the suite lock first, so the lock cannot be forgotten (ADR-014, E-002). A suite whose jobs
// come from the HTTP API (no enqueue call) calls lock() in beforeAll so the wait happens there.
export interface JobRowData {
  cvId: string;
  userId: string;
  status: string;
  stage?: string | null;
  attempt?: number;
  leasedUntil?: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface JobTestSuite {
  enqueue(data: JobRowData, tx?: Prisma.TransactionClient): Promise<string>;
  // Test-only: makes a running job's lease expired, as if its worker died.
  expireLease(jobId: string): Promise<void>;
  // Test-only: deletes every non-terminal generation_jobs row, so a scenario that depends on which row
  // claimNext takes starts from an empty queue. Takes the suite lock first.
  clearOpenJobs(): Promise<void>;
  lock(): Promise<void>;
  readonly holdsLock: boolean;
  release(): Promise<void>;
}

export function openJobTestSuite(prisma: PrismaClient): JobTestSuite {
  let held: JobSuiteLock | null = null;
  let acquiring: Promise<void> | null = null;

  const suite: JobTestSuite = {
    get holdsLock() {
      return held !== null;
    },
    async lock() {
      if (held) return;
      acquiring ??= acquireJobSuiteLock()
        .then((lock) => {
          held = lock;
        })
        .finally(() => {
          acquiring = null;
        });
      await acquiring;
    },
    async enqueue(data, tx) {
      await suite.lock();
      const client: Pick<PrismaClient, 'generationJob'> = tx ?? prisma;
      const row = await client.generationJob.create({ data });
      return row.id;
    },
    // Test-only: moves a running job's lease into the past, as if its worker had died, so a
    // successor's claimNext takes the row. Takes the suite lock like enqueue.
    async expireLease(jobId) {
      await suite.lock();
      await prisma.generationJob.updateMany({
        where: { id: jobId },
        data: { leasedUntil: new Date(Date.now() - 1_000) },
      });
    },
    async clearOpenJobs() {
      await suite.lock();
      await prisma.generationJob.deleteMany({ where: { status: { in: ['queued', 'running'] } } });
    },
    async release() {
      if (acquiring) await acquiring.catch(() => undefined);
      const lock = held;
      held = null;
      await lock?.release();
    },
  };
  return suite;
}
