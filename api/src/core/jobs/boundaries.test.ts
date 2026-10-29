import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS } from './test-lock.js';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';

// T-16 (CVB-8). Boundary guards and the partial unique index. Kept out of jobs.test.ts so that
// these cases do not depend on ./worker.js existing.

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = join(here, '..', '..', '..');

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';

const prisma = new PrismaClient();
const suite = openJobTestSuite(prisma);
const userIds: string[] = [];

async function seedUserAndCv() {
  const userId = randomUUID();
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `jobs-idx-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  const cv = await prisma.cv.create({
    data: { userId, targetRole: 'Backend Engineer', sourceKind: 'text', sourceText: 'x', state: 'generating' },
  });
  return { userId, cvId: cv.id };
}

afterAll(async () => {
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
  await suite.release();
});

beforeAll(async () => {
  await suite.lock();
}, JOB_SUITE_LOCK_WAIT_MS);

// Job rows are created inside a transaction that always rolls back. jobs.test.ts runs in parallel on
// the same DB and deletes and claims queued rows, so committed rows here would leak into its cases.
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

describe('ADR-004 / database-schema generation_jobs: one in-flight job per CV', () => {
  it('rejects a second queued job for the same CV (partial unique index)', async () => {
    const { userId, cvId } = await seedUserAndCv();
    await rolledBack(async (tx) => {
      await suite.enqueue({ cvId, userId, status: 'queued' }, tx);
      await expect(
        suite.enqueue({ cvId, userId, status: 'queued' }, tx),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  it('rejects a second job while the first is running', async () => {
    const { userId, cvId } = await seedUserAndCv();
    await rolledBack(async (tx) => {
      await suite.enqueue({ cvId, userId, status: 'running', attempt: 1 }, tx);
      await expect(
        suite.enqueue({ cvId, userId, status: 'queued' }, tx),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  it('allows a new job once the previous one is succeeded or failed', async () => {
    const { userId, cvId } = await seedUserAndCv();
    await rolledBack(async (tx) => {
      await suite.enqueue({ cvId, userId, status: 'succeeded' }, tx);
      await suite.enqueue({ cvId, userId, status: 'failed' }, tx);

      const nextId = await suite.enqueue({ cvId, userId, status: 'queued' }, tx);
      const next = await tx.generationJob.findUniqueOrThrow({ where: { id: nextId } });

      expect(next.status).toBe('queued');
    });
  });
});

describe('ADR-004 / C-012 seam: the jobs module depends on the pipeline interface only', () => {
  const jobsDir = join(apiRoot, 'src', 'core', 'jobs');

  function sourceFiles(): string[] {
    return readdirSync(jobsDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => join(jobsDir, f));
  }

  it('has at least one production file (guards against an empty pass)', () => {
    expect(sourceFiles().length).toBeGreaterThan(0);
  });

  // ADR-021: ledger.js is part of the C-012 seam (the per-job balance the worker creates), a pure module with no SDK.
  it('imports from core/generation only types.js and ledger.js', () => {
    const offending: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, 'utf8');
      const specs = [...text.matchAll(/(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of specs) {
        if (spec.includes('generation') && !/generation\/(types|ledger)(\.js)?$/.test(spec)) {
          offending.push(`${file}: ${spec}`);
        }
      }
    }
    expect(offending).toEqual([]);
  });

  it('adds no broker or queue dependency (ADR-004)', () => {
    const pkg = JSON.parse(readFileSync(join(apiRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.filter((d) => /bullmq|ioredis|^redis$|pg-boss|bull$/.test(d))).toEqual([]);
  });
});
