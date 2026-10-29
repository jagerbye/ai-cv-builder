import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { acquireJobSuiteLock, JOB_SUITE_LOCK_WAIT_MS, type JobSuiteLock } from '../../api/src/core/jobs/test-lock.js';

// T-21 (CVB-19), ADR-007 and C-000. jobs.ts and cvs-create.ts each hand-rolled the session
// lookup. Both must go through requireUser: 401 UNAUTHENTICATED with the canonical envelope,
// and another user's job answered 404, never 403. Behaviour must not change.
// Expected to be RED now on the message and source-level assertions; the status-code
// assertions are regression guards and should already pass.

process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder';
process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used-by-intake';

const { buildServer } = await import('../../api/src/server.js');

const prisma = new PrismaClient();
const UNAUTH_MESSAGE = 'Sign in is required.';
const JOB_ID = '6f1d6a1e-2b1c-4a57-9d1e-0c2f3a4b5c6d';
const EXPIRED = new Date('2001-01-01T00:00:00Z');
const FUTURE = new Date('2099-01-01T00:00:00Z');

let app: FastifyInstance;
let suiteLock: JobSuiteLock;
const userIds: string[] = [];

function chars(n: number): string {
  const unit = 'Built payment APIs for retail clients in a team of six. ';
  return unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
}

async function seedSession(expiresAt: Date): Promise<string> {
  const userId = randomUUID();
  userIds.push(userId);
  const token = randomBytes(32).toString('base64url');
  await prisma.user.create({
    data: { id: userId, email: `hardening-session-${userId}@example.test`, passwordHash: 'not-a-real-hash' },
  });
  await prisma.session.create({
    data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt },
  });
  return `sid=${token}`;
}

function expectUnauthenticated(res: { statusCode: number; json: () => unknown }): void {
  expect(res.statusCode).toBe(401);
  expect(res.json()).toEqual({ error: { code: 'UNAUTHENTICATED', message: UNAUTH_MESSAGE } });
}

beforeAll(async () => {
  suiteLock = await acquireJobSuiteLock();
  app = buildServer();
  await app.ready();
}, JOB_SUITE_LOCK_WAIT_MS);

afterAll(async () => {
  await app.close();
  // Users cascade to sessions, cvs and generation_jobs. Runs under the suite lock, before release.
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
  await suiteLock.release();
});

describe('GET /api/jobs/:jobId goes through requireUser', () => {
  it('no cookie answers 401 with the canonical UNAUTHENTICATED envelope', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${JOB_ID}` });
    expectUnauthenticated(res);
  });

  it('a malformed cookie value (outside the token shape) answers 401 before any lookup', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${JOB_ID}`, headers: { cookie: 'sid=short' } });
    expectUnauthenticated(res);
  });

  it('an expired session answers 401, not 404', async () => {
    const cookie = await seedSession(EXPIRED);
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${JOB_ID}`, headers: { cookie } });
    expectUnauthenticated(res);
  });
});

describe('POST /api/cvs goes through requireUser', () => {
  const body = JSON.stringify({ targetRole: 'Backend Engineer', sourceText: chars(300) });

  it('no cookie answers 401 with the canonical UNAUTHENTICATED envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      headers: { 'content-type': 'application/json' },
      payload: body,
    });
    expectUnauthenticated(res);
  });

  it('a malformed cookie value answers 401 before any lookup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      headers: { 'content-type': 'application/json', cookie: 'sid=short' },
      payload: body,
    });
    expectUnauthenticated(res);
  });

  it('an expired session answers 401 and creates nothing', async () => {
    const cookie = await seedSession(EXPIRED);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      headers: { 'content-type': 'application/json', cookie },
      payload: body,
    });
    expectUnauthenticated(res);
  });

  it('a live session is accepted and the CV is created for that user', async () => {
    const cookie = await seedSession(FUTURE);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      headers: { 'content-type': 'application/json', cookie },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('source: the two hand-rolled session lookups are gone', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('jobs.ts imports requireUser and no longer parses the cookie or hashes the token itself', () => {
    const src = read('../../api/src/routes/jobs.ts');
    expect(src).toMatch(/from '\.\.\/http\/requireUser\.js'/);
    expect(src).not.toContain('createHash');
    expect(src).not.toMatch(/function (sessionUserId|readCookie)\b/);
    expect(src).not.toMatch(/SESSION_COOKIE\s*=/);
  });

  it('cvs-create.ts imports requireUser and no longer parses the cookie or hashes the token itself', () => {
    const src = read('../../api/src/routes/cvs-create.ts');
    expect(src).toMatch(/from '\.\.\/http\/requireUser\.js'/);
    expect(src).not.toContain('createHash');
    expect(src).not.toMatch(/function (sessionUserId|readCookie)\b/);
    expect(src).not.toMatch(/SESSION_COOKIE\s*=/);
  });
});
