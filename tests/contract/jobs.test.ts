import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { openJobTestSuite, JOB_SUITE_LOCK_WAIT_MS } from '../../api/src/core/jobs/test-lock.js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

// T-16 (CVB-8). Contract tests for C-005: GET /api/jobs/:jobId.
// Black-box over the Fastify app and real Postgres; rows are seeded directly and the caller
// authenticates with a `sid` cookie whose sha256 is stored as sessions.token_hash (as in cvs-read).
// Error envelope: { error: { code, message } } (C-000). Another user's job is 404, never 403.

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';
const { buildServer } = await import('../../api/src/server.js');

const prisma = new PrismaClient();
const suite = openJobTestSuite(prisma);
let app: FastifyInstance;
const userIds: string[] = [];

interface Caller {
  userId: string;
  cookie: string;
}

async function seedUser(): Promise<Caller> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  userIds.push(userId);
  await prisma.user.create({
    data: { id: userId, email: `jobs-get-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });
  return { userId, cookie: `sid=${token}` };
}

async function seedCv(userId: string): Promise<string> {
  const cv = await prisma.cv.create({
    data: { userId, targetRole: 'Backend Engineer', sourceKind: 'text', sourceText: 'x', state: 'generating' },
  });
  return cv.id;
}

async function seedJob(
  userId: string,
  cvId: string,
  data: {
    status: string;
    stage?: string | null;
    attempt?: number;
    leasedUntil?: Date | null;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  },
): Promise<string> {
  return suite.enqueue({
      cvId,
      userId,
      status: data.status,
      stage: data.stage ?? null,
      attempt: data.attempt ?? 0,
      leasedUntil: data.leasedUntil ?? null,
      startedAt: data.startedAt ?? null,
      finishedAt: data.finishedAt ?? null,
      errorCode: data.errorCode ?? null,
      errorMessage: data.errorMessage ?? null,
  });
}

function getJob(jobId: string, cookie?: string) {
  return app.inject({
    method: 'GET',
    url: `/api/jobs/${jobId}`,
    headers: cookie ? { cookie } : {},
  });
}

beforeAll(async () => {
  await suite.lock();
  app = buildServer();
  await app.ready();
}, JOB_SUITE_LOCK_WAIT_MS);

afterAll(async () => {
  // Users cascade to sessions, cvs and generation_jobs.
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await app.close();
  await prisma.$disconnect();
  await suite.release();
});

describe('C-005 GET /api/jobs/:jobId: shape per status', () => {
  it('a queued job: status queued, stage null, attempt 0, no error, no timestamps yet', async () => {
    const me = await seedUser();
    const cvId = await seedCv(me.userId);
    const jobId = await seedJob(me.userId, cvId, { status: 'queued' });

    const res = await getJob(jobId, me.cookie);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ id: jobId, cvId, status: 'queued', stage: null, attempt: 0, startedAt: null, finishedAt: null });
    expect('error' in body).toBe(false);
  });

  it('a running job reports its named stage and attempt', async () => {
    const me = await seedUser();
    const cvId = await seedCv(me.userId);
    const startedAt = new Date('2026-10-28T10:00:00.000Z');
    const jobId = await seedJob(me.userId, cvId, {
      status: 'running',
      stage: 'composing',
      attempt: 1,
      startedAt,
      leasedUntil: new Date(Date.now() + 60_000),
    });

    const body = (await getJob(jobId, me.cookie)).json();

    expect(body.status).toBe('running');
    expect(body.stage).toBe('composing');
    expect(body.attempt).toBe(1);
    expect(body.startedAt).toBe('2026-10-28T10:00:00.000Z');
    expect(body.finishedAt).toBeNull();
  });

  it('a succeeded job has stage null, a finishedAt, and no error', async () => {
    const me = await seedUser();
    const cvId = await seedCv(me.userId);
    const jobId = await seedJob(me.userId, cvId, {
      status: 'succeeded',
      attempt: 1,
      startedAt: new Date('2026-10-28T10:00:00.000Z'),
      finishedAt: new Date('2026-10-28T10:00:05.000Z'),
    });

    const body = (await getJob(jobId, me.cookie)).json();

    expect(body.status).toBe('succeeded');
    expect(body.stage).toBeNull();
    expect(body.finishedAt).toBe('2026-10-28T10:00:05.000Z');
    expect('error' in body).toBe(false);
  });

  it('a failed job carries a classified error { code, message }', async () => {
    const me = await seedUser();
    const cvId = await seedCv(me.userId);
    const jobId = await seedJob(me.userId, cvId, {
      status: 'failed',
      attempt: 1,
      startedAt: new Date('2026-10-28T10:00:00.000Z'),
      finishedAt: new Date('2026-10-28T10:03:00.000Z'),
      errorCode: 'JOB_TIMEOUT',
      errorMessage: 'The generation did not finish within 180 seconds.',
    });

    const body = (await getJob(jobId, me.cookie)).json();

    expect(body.status).toBe('failed');
    expect(body.error).toEqual({
      code: 'JOB_TIMEOUT',
      message: 'The generation did not finish within 180 seconds.',
    });
  });

  it('exposes exactly the C-005 fields: no userId, no leasedUntil, no token counts', async () => {
    const me = await seedUser();
    const cvId = await seedCv(me.userId);
    const jobId = await seedJob(me.userId, cvId, {
      status: 'running',
      stage: 'extracting',
      attempt: 1,
      startedAt: new Date(),
      leasedUntil: new Date(Date.now() + 60_000),
    });

    const body = (await getJob(jobId, me.cookie)).json();

    expect(Object.keys(body).sort()).toEqual(
      ['attempt', 'cvId', 'finishedAt', 'id', 'stage', 'startedAt', 'status'].sort(),
    );
  });
});

describe('C-005 GET /api/jobs/:jobId: ownership', () => {
  it('an unknown job id answers 404 NOT_FOUND in the error envelope', async () => {
    const me = await seedUser();

    const res = await getJob(randomUUID(), me.cookie);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it("another user's job answers 404, identical to an unknown id", async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await seedJob(owner.userId, cvId, { status: 'queued' });

    const foreign = await getJob(jobId, intruder.cookie);
    const unknown = await getJob(randomUUID(), intruder.cookie);

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(unknown.json());
    expect(foreign.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(foreign.body).not.toContain(jobId);
  });

  it("the owner still sees their job after another user's request for it", async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    const cvId = await seedCv(owner.userId);
    const jobId = await seedJob(owner.userId, cvId, { status: 'queued' });

    await getJob(jobId, intruder.cookie);
    const res = await getJob(jobId, owner.cookie);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: jobId, status: 'queued' });
  });
});
