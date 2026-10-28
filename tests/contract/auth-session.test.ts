import { describe, it, expect, afterAll, beforeAll, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../api/src/core/auth/password';
import { installErrorEnvelope } from '../../api/src/http/errors';

// T-04 (CVB-4). Contract suite for C-002 (login, logout, me), the session cookie
// (F-001, ADR-007), requireUser (401 before any work) and assertOwnership (404,
// never 403) through a real route. Criteria: spec.md F-001 §3.1 and
// api-contracts.md C-002. Real Fastify app via buildServer().inject(), real
// Postgres via DATABASE_URL, the same pattern as auth-register.test.ts. Nothing mocked.
//
// Not covered here, on purpose:
//  - 429 RATE_LIMITED on login (T-21, wave B).
//  - Timing parity of login (wrong email vs wrong password): not a stable assertion.
//  - Register-issued sessions: T-03 issues a cookie without a Session row; that
//    gap is closed by the T-04 developer step, and the register suite covers the 201.

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const LIVE_URL = ORIGINAL_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder';
const TAG = 'cvb-t4-';
const PASSWORD = 'correct-horse-battery-4';
const THIRTY_DAYS_S = 30 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
});

async function loadServer(databaseUrl: string): Promise<FastifyInstance> {
  vi.resetModules();
  process.env.DATABASE_URL = databaseUrl;
  const mod = await import('../../api/src/server');
  return mod.buildServer();
}

let app: FastifyInstance;
let probe: FastifyInstance;
let probeHits = 0;
let userA: { id: string; email: string };
let userB: { id: string; email: string };
let cvOfB: { id: string };
// requireUser and assertOwnership are loaded dynamically so that a missing module
// fails the probe tests with its own message and leaves the HTTP tests to fail on
// their assertions, which is the signal the developer needs.
let probeLoadError: unknown = null;

beforeAll(async () => {
  app = await loadServer(LIVE_URL);
  const hash = await hashPassword(PASSWORD);
  userA = await app.prisma.user.create({
    data: { email: `${TAG}a-${Date.now()}@example.com`, passwordHash: hash },
    select: { id: true, email: true },
  });
  userB = await app.prisma.user.create({
    data: { email: `${TAG}b-${Date.now()}@example.com`, passwordHash: hash },
    select: { id: true, email: true },
  });
  cvOfB = await app.prisma.cv.create({
    data: { userId: userB.id, targetRole: 'Engineer', sourceKind: 'text', sourceText: 'owned by B', state: 'ready' },
    select: { id: true },
  });

  // Probe app: real requireUser and assertOwnership over the same database.
  try {
    const { requireUser } = await import('../../api/src/http/requireUser');
    const { assertOwnership } = await import('../../api/src/core/auth/ownership');
    probe = Fastify({ logger: false });
    probe.decorate('prisma', app.prisma as PrismaClient);
    installErrorEnvelope(probe);
    probe.get('/probe/session', { preHandler: requireUser }, async () => {
      probeHits += 1;
      return { ok: true };
    });
    probe.get('/probe/cv/:id', { preHandler: requireUser }, async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const caller = (request as unknown as { user: { id: string } }).user;
      const cv = await app.prisma.cv.findUnique({ where: { id: request.params.id } });
      assertOwnership(caller.id, cv);
      return { id: cv!.id };
    });
    await probe.ready();
  } catch (err) {
    probeLoadError = err;
    probe = undefined as unknown as FastifyInstance;
  }
});

function requireProbe(): FastifyInstance {
  if (!probe) throw new Error(`requireUser/assertOwnership not loadable: ${String((probeLoadError as Error)?.message ?? probeLoadError)}`);
  return probe;
}

afterAll(async () => {
  if (probe) await probe.close();
  if (app) {
    await app.prisma.user.deleteMany({ where: { email: { contains: TAG } } });
    await app.close();
  }
});

function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ email, password }),
  });
}

function me(cookie?: string) {
  return app.inject({ method: 'GET', url: '/api/auth/me', headers: cookie ? { cookie } : {} });
}

function logout(cookie?: string) {
  return app.inject({ method: 'POST', url: '/api/auth/logout', headers: cookie ? { cookie } : {} });
}

function setCookies(res: { headers: Record<string, unknown> }): string[] {
  const raw = res.headers['set-cookie'];
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}

function sidFrom(res: { headers: Record<string, unknown> }): { value: string; attrs: string } {
  const sid = setCookies(res).find((c) => c.startsWith('sid='));
  expect(sid, 'a sid Set-Cookie header must be present').toBeDefined();
  const [pair, ...rest] = sid!.split(';');
  return { value: pair.slice('sid='.length), attrs: rest.map((s) => s.trim()).join('; ') };
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function expectErrorEnvelope(res: { statusCode: number; json: () => any }, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  const body = res.json();
  expect(Object.keys(body)).toEqual(['error']);
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
}

describe('C-002 POST /api/auth/login: success', () => {
  it('200 with exactly { user: { id, email } } and an httpOnly, SameSite=Lax sid cookie', async () => {
    const res = await login(userA.email, PASSWORD);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: { id: userA.id, email: userA.email } });
    const { attrs } = sidFrom(res);
    expect(attrs).toMatch(/(^|; )HttpOnly(;|$)/);
    expect(attrs).toMatch(/SameSite=Lax/);
  });

  it('cookie expiry is 30 days (Max-Age=2592000)', async () => {
    const res = await login(userA.email, PASSWORD);
    expect(sidFrom(res).attrs).toMatch(/Max-Age=2592000/);
    expect(THIRTY_DAYS_S).toBe(2592000);
  });

  it('the cookie value is opaque base64url with at least 256 bits, and differs per login', async () => {
    const first = sidFrom(await login(userA.email, PASSWORD)).value;
    const second = sidFrom(await login(userA.email, PASSWORD)).value;
    expect(first).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(first).not.toBe(second);
  });

  it('stores only sha256 of the token: a Session row with tokenHash = sha256(cookie) and no row holding the raw token', async () => {
    const before = await app.prisma.session.count({ where: { userId: userA.id } });
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    const after = await app.prisma.session.count({ where: { userId: userA.id } });
    expect(after).toBe(before + 1);
    const row = await app.prisma.session.findUnique({ where: { tokenHash: sha256Hex(value) } });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(userA.id);
    expect(row!.tokenHash).not.toBe(value);
    expect(await app.prisma.session.findUnique({ where: { tokenHash: value } })).toBeNull();
  });

  it('session expiresAt is about 30 days from now', async () => {
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    const row = await app.prisma.session.findUnique({ where: { tokenHash: sha256Hex(value) } });
    const days = (row!.expiresAt.getTime() - Date.now()) / DAY_MS;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('two different users each get their own identity back from the cookie', async () => {
    const a = sidFrom(await login(userA.email, PASSWORD)).value;
    const b = sidFrom(await login(userB.email, PASSWORD)).value;
    expect((await me(`sid=${a}`)).json()).toEqual({ user: { id: userA.id, email: userA.email } });
    expect((await me(`sid=${b}`)).json()).toEqual({ user: { id: userB.id, email: userB.email } });
  });
});

describe('C-002 POST /api/auth/login: failure is 401 with one message', () => {
  it('unknown email is 401 UNAUTHENTICATED and sets no cookie', async () => {
    const res = await login(`${TAG}nobody-${Date.now()}@example.com`, PASSWORD);
    expectErrorEnvelope(res, 401, 'UNAUTHENTICATED');
    expect(setCookies(res)).toEqual([]);
  });

  it('wrong password for an existing email is 401 UNAUTHENTICATED and sets no cookie', async () => {
    const res = await login(userA.email, 'wrong-password-zzz-1');
    expectErrorEnvelope(res, 401, 'UNAUTHENTICATED');
    expect(setCookies(res)).toEqual([]);
  });

  it('the unknown-email and wrong-password bodies are byte-identical (no enumeration)', async () => {
    const unknown = await login(`${TAG}ghost-${Date.now()}@example.com`, PASSWORD);
    const wrong = await login(userA.email, 'wrong-password-zzz-2');
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.body).toBe(wrong.body);
  });

  it('a failed login creates no Session row', async () => {
    const before = await app.prisma.session.count({ where: { userId: userB.id } });
    expectErrorEnvelope(await login(userB.email, 'wrong-password-zzz-3'), 401, 'UNAUTHENTICATED');
    expect(await app.prisma.session.count({ where: { userId: userB.id } })).toBe(before);
  });

  it('the 401 message does not echo the submitted email or password', async () => {
    const attemptEmail = `${TAG}echo-${Date.now()}@example.com`;
    const attemptPw = 'echo-password-should-not-appear-9';
    const res = await login(attemptEmail, attemptPw);
    expectErrorEnvelope(res, 401, 'UNAUTHENTICATED');
    expect(res.body).not.toContain(attemptEmail);
    expect(res.body).not.toContain(attemptPw);
  });
});

describe('C-002 GET /api/auth/me', () => {
  it('200 with { user: { id, email } } for a valid session cookie', async () => {
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    const res = await me(`sid=${value}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: { id: userA.id, email: userA.email } });
  });

  it('no cookie is 401 UNAUTHENTICATED', async () => {
    expectErrorEnvelope(await me(), 401, 'UNAUTHENTICATED');
  });

  it('an unknown opaque value is 401 UNAUTHENTICATED', async () => {
    expectErrorEnvelope(await me('sid=not-a-real-session-token-0000000000000000000'), 401, 'UNAUTHENTICATED');
  });

  it('a stored hash presented as the cookie value is 401 (only the raw token authenticates)', async () => {
    const token = `test-raw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await app.prisma.user.findUniqueOrThrow({ where: { id: userA.id } });
    await app.prisma.session.create({
      data: { userId: user.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + DAY_MS) },
    });
    expect((await me(`sid=${token}`)).statusCode).toBe(200);
    expectErrorEnvelope(await me(`sid=${sha256Hex(token)}`), 401, 'UNAUTHENTICATED');
  });

  it('an expired session row is 401 UNAUTHENTICATED', async () => {
    const token = `test-expired-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await app.prisma.session.create({
      data: { userId: userA.id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() - DAY_MS) },
    });
    expectErrorEnvelope(await me(`sid=${token}`), 401, 'UNAUTHENTICATED');
  });
});

describe('C-002 POST /api/auth/logout: deletes the row, idempotent, 204', () => {
  it('a valid session gets 204, a cleared sid cookie, and its Session row is deleted', async () => {
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    const hash = sha256Hex(value);
    expect(await app.prisma.session.findUnique({ where: { tokenHash: hash } })).not.toBeNull();
    const res = await logout(`sid=${value}`);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    const cleared = setCookies(res).find((c) => c.startsWith('sid='));
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    expect(await app.prisma.session.findUnique({ where: { tokenHash: hash } })).toBeNull();
  });

  it('the old cookie no longer authenticates after logout', async () => {
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    await logout(`sid=${value}`);
    expectErrorEnvelope(await me(`sid=${value}`), 401, 'UNAUTHENTICATED');
  });

  it('a second logout with the same cookie is still 204 (idempotent)', async () => {
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    expect((await logout(`sid=${value}`)).statusCode).toBe(204);
    expect((await logout(`sid=${value}`)).statusCode).toBe(204);
  });

  it('logout with no cookie and with an unknown cookie is 204 and deletes nothing', async () => {
    const before = await app.prisma.session.count({ where: { userId: userA.id } });
    expect((await logout()).statusCode).toBe(204);
    expect((await logout('sid=never-issued-token-000000000000000000000000')).statusCode).toBe(204);
    expect(await app.prisma.session.count({ where: { userId: userA.id } })).toBe(before);
  });

  it('logout of one browser does not end the same user\'s other session', async () => {
    const first = sidFrom(await login(userA.email, PASSWORD)).value;
    const second = sidFrom(await login(userA.email, PASSWORD)).value;
    await logout(`sid=${first}`);
    expectErrorEnvelope(await me(`sid=${first}`), 401, 'UNAUTHENTICATED');
    expect((await me(`sid=${second}`)).statusCode).toBe(200);
  });
});

describe('requireUser: 401 before any work', () => {
  it('no cookie is 401 UNAUTHENTICATED and the protected handler never runs', async () => {
    const before = probeHits;
    const res = await requireProbe().inject({ method: 'GET', url: '/probe/session' });
    expectErrorEnvelope(res, 401, 'UNAUTHENTICATED');
    expect(probeHits).toBe(before);
  });

  it('an invalid cookie is 401 and the handler never runs', async () => {
    const before = probeHits;
    const res = await requireProbe().inject({ method: 'GET', url: '/probe/session', headers: { cookie: 'sid=garbage-000000000000000000000000000000000' } });
    expectErrorEnvelope(res, 401, 'UNAUTHENTICATED');
    expect(probeHits).toBe(before);
  });

  it('a valid cookie lets the handler run exactly once', async () => {
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    const before = probeHits;
    const res = await requireProbe().inject({ method: 'GET', url: '/probe/session', headers: { cookie: `sid=${value}` } });
    expect(res.statusCode).toBe(200);
    expect(probeHits).toBe(before + 1);
  });
});

describe('F-001 ownership: user A requesting user B\'s row receives 404, never 403', () => {
  it('user A GET of B\'s CV is 404 NOT_FOUND', async () => {
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    const res = await requireProbe().inject({ method: 'GET', url: `/probe/cv/${cvOfB.id}`, headers: { cookie: `sid=${value}` } });
    expectErrorEnvelope(res, 404, 'NOT_FOUND');
    expect(res.statusCode).not.toBe(403);
    expect(res.body).not.toContain(cvOfB.id);
  });

  it('user B GET of B\'s own CV is 200 with the id (the same route is not simply broken)', async () => {
    const { value } = sidFrom(await login(userB.email, PASSWORD));
    const res = await requireProbe().inject({ method: 'GET', url: `/probe/cv/${cvOfB.id}`, headers: { cookie: `sid=${value}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: cvOfB.id });
  });

  it('a CV id that does not exist is 404 NOT_FOUND, indistinguishable from another user\'s', async () => {
    const { value } = sidFrom(await login(userA.email, PASSWORD));
    const missing = await requireProbe().inject({ method: 'GET', url: '/probe/cv/00000000-0000-4000-8000-000000000000', headers: { cookie: `sid=${value}` } });
    const foreign = await requireProbe().inject({ method: 'GET', url: `/probe/cv/${cvOfB.id}`, headers: { cookie: `sid=${value}` } });
    expectErrorEnvelope(missing, 404, 'NOT_FOUND');
    expect(missing.body).toBe(foreign.body);
  });
});
