import { PrismaClient } from '@prisma/client';

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
