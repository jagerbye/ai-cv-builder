import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { acquireJobSuiteLock, JOB_SUITE_LOCK_WAIT_MS, type JobSuiteLock } from '../../api/src/core/jobs/test-lock.js';

// T-21 (CVB-19), F-010. Per-user rate limits, one global hook in server.ts:
//   generation = a request that enqueues a job (POST /api/cvs, POST /api/cvs/:cvId/regenerate):
//                10 per hour per user, counted only when the request is accepted for a job.
//   write      = any POST, PATCH or DELETE under /api: 60 per minute per user, counted whatever the outcome.
// Exceeding either answers 429 RATE_LIMITED with a Retry-After header in whole seconds.
// Unauthenticated requests are keyed by nothing and are not counted.
//
// Clock is injected through buildServer({ now }) and never slept on. T0 sits on a whole hour and a
// whole minute, so a fixed-window and a sliding-window implementation give the same answers at the
// boundaries the tests probe. The window type is not pinned here.
//
// The counters are in-process (single container); the tests run one app per test so they start empty.
// Expected to be RED now: no hook exists and no clock option exists.

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder';
process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used-by-intake';

const { buildServer } = await import('../../api/src/server.js');

const T0 = Date.parse('2026-10-29T10:00:00.000Z');
const SEC = 1000;

const prisma = new PrismaClient();
let suiteLock: JobSuiteLock;
let clock: { t: number };
let app: FastifyInstance;

function chars(n: number): string {
  const unit = 'Built payment APIs for retail clients in a team of six. ';
  return unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
}

const VALID_CREATE = JSON.stringify({ targetRole: 'Backend Engineer', sourceText: chars(300) });
const INVALID_CREATE = JSON.stringify({});

async function seedUser(): Promise<string> {
  const userId = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await prisma.user.create({
    data: { id: userId, email: `hardening-rl-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  await prisma.session.create({
    data: {
      userId,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    },
  });
  return `sid=${token}`;
}

async function seedReadyCv(cookie: string): Promise<string> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: createHash('sha256').update(cookie.slice(4)).digest('hex') },
  });
  const cv = await prisma.cv.create({
    data: {
      userId: session!.userId,
      targetRole: 'Backend Engineer',
      sourceKind: 'text',
      sourceText: 'Ada Lovelace, Backend Engineer, London.',
      state: 'ready',
      version: 1,
    },
  });
  return cv.id;
}

function post(cookie: string | undefined, payload: string) {
  return app.inject({
    method: 'POST',
    url: '/api/cvs',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    payload,
  });
}

function createGeneration(cookie: string) {
  return post(cookie, VALID_CREATE);
}

function expectRateLimited(res: { statusCode: number; json: () => unknown; headers: Record<string, unknown> }): void {
  expect(res.statusCode).toBe(429);
  expect(res.json()).toEqual({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' } });
  const retryAfter = String(res.headers['retry-after'] ?? '');
  expect(retryAfter).toMatch(/^[1-9]\d*$/);
}

beforeAll(async () => {
  suiteLock = await acquireJobSuiteLock();
}, JOB_SUITE_LOCK_WAIT_MS);

afterAll(async () => {
  await prisma.$disconnect();
  await suiteLock.release();
});

beforeEach(async () => {
  clock = { t: T0 };
  app = buildServer({ now: () => clock.t });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('generations: 10 per hour per user', () => {
  it('the first ten generations are accepted and the eleventh is 429 RATE_LIMITED with Retry-After', async () => {
    const cookie = await seedUser();
    for (let i = 0; i < 10; i++) {
      expect((await createGeneration(cookie)).statusCode).toBe(201);
    }
    const eleventh = await createGeneration(cookie);
    expectRateLimited(eleventh);
    const retryAfter = Number(eleventh.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });

  it('the budget stays closed just before the hour and reopens once the hour has passed', async () => {
    const cookie = await seedUser();
    for (let i = 0; i < 10; i++) {
      expect((await createGeneration(cookie)).statusCode).toBe(201);
    }
    clock.t = T0 + 1 * SEC;
    expectRateLimited(await createGeneration(cookie));

    clock.t = T0 + 3599 * SEC;
    expectRateLimited(await createGeneration(cookie));

    clock.t = T0 + 3601 * SEC;
    expect((await createGeneration(cookie)).statusCode).toBe(201);
  });

  it('the budget is per user: another user is not blocked by one who hit the limit', async () => {
    const a = await seedUser();
    const b = await seedUser();
    for (let i = 0; i < 10; i++) {
      expect((await createGeneration(a)).statusCode).toBe(201);
    }
    expectRateLimited(await createGeneration(a));
    expect((await createGeneration(b)).statusCode).toBe(201);
  });

  it('regenerate counts against the same hourly budget as create', async () => {
    const cookie = await seedUser();
    const cvId = await seedReadyCv(cookie);
    for (let i = 0; i < 10; i++) {
      expect((await createGeneration(cookie)).statusCode).toBe(201);
    }
    const res = await app.inject({
      method: 'POST',
      url: `/api/cvs/${cvId}/regenerate`,
      headers: { cookie },
    });
    expectRateLimited(res);
  });

  it('a create rejected for validation enqueues nothing and does not use a generation slot', async () => {
    const cookie = await seedUser();
    for (let i = 0; i < 10; i++) {
      expect((await post(cookie, INVALID_CREATE)).statusCode).toBe(400);
    }
    for (let i = 0; i < 10; i++) {
      expect((await createGeneration(cookie)).statusCode).toBe(201);
    }
  });

  it('unauthenticated creates are not counted and never answer 429', async () => {
    for (let i = 0; i < 15; i++) {
      const res = await post(undefined, VALID_CREATE);
      expect(res.statusCode).toBe(401);
    }
  });
});

describe('writes: 60 per minute per user', () => {
  it('sixty writes are accepted and the sixty-first is 429 RATE_LIMITED with Retry-After', async () => {
    const cookie = await seedUser();
    for (let i = 0; i < 60; i++) {
      const res = await post(cookie, INVALID_CREATE);
      expect(res.statusCode).toBe(400);
    }
    expectRateLimited(await post(cookie, INVALID_CREATE));
  });

  it('the minute window reopens once a full minute has passed', async () => {
    const cookie = await seedUser();
    for (let i = 0; i < 60; i++) {
      expect((await post(cookie, INVALID_CREATE)).statusCode).toBe(400);
    }
    clock.t = T0 + 1 * SEC;
    expectRateLimited(await post(cookie, INVALID_CREATE));

    clock.t = T0 + 61 * SEC;
    expect((await post(cookie, INVALID_CREATE)).statusCode).toBe(400);
  });

  it('PATCH and DELETE count as writes alongside POST', async () => {
    const cookie = await seedUser();
    const target = randomUUID();
    for (let i = 0; i < 30; i++) {
      const del = await app.inject({ method: 'DELETE', url: `/api/cvs/${target}`, headers: { cookie } });
      expect(del.statusCode).not.toBe(429);
      const patch = await app.inject({
        method: 'PATCH',
        url: `/api/cvs/${target}`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: '{}',
      });
      expect(patch.statusCode).not.toBe(429);
    }
    expectRateLimited(await post(cookie, INVALID_CREATE));
  });

  it('GET requests are not writes and are never rate limited by this rule', async () => {
    const cookie = await seedUser();
    for (let i = 0; i < 100; i++) {
      const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
      expect(res.statusCode).toBe(200);
    }
  });
});
