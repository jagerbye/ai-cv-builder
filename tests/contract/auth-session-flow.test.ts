// T-04 reopened (CVB-4). Session flow across register, login, me and logout, on the
// host against live Postgres. F-001 (register logs the user in, the session survives
// reloads) and C-002 (me, logout). Complements auth-session.test.ts, which covers login
// and logout in isolation. Real Fastify app via buildServer().inject(); nothing mocked.
// The same flow against the running container is in auth-session-container.test.ts.
import { describe, it, expect, afterAll, beforeAll, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const LIVE_URL = ORIGINAL_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder';
const TAG = 'cvb-t4flow-';
const PASSWORD = 'correct-horse-battery-flow';

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
const email = `${TAG}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

beforeAll(async () => {
  app = await loadServer(LIVE_URL);
});

afterAll(async () => {
  if (app) {
    await app.prisma.user.deleteMany({ where: { email: { contains: TAG } } });
    await app.close();
  }
});

function sidValue(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw.map(String) : raw === undefined ? [] : [String(raw)];
  const sid = list.find((c) => c.startsWith('sid='));
  expect(sid, 'a sid Set-Cookie header must be present').toBeDefined();
  return sid!.split(';')[0].slice('sid='.length);
}

function register(e: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ email: e, password }),
  });
}

function login(e: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'content-type': 'application/json' },
    payload: JSON.stringify({ email: e, password }),
  });
}

describe('F-001: register logs the user in, and that session is a real session', () => {
  let registeredCookie: string;
  let registeredId: string;

  it('register answers 201 and its cookie is accepted by GET /api/auth/me', async () => {
    const res = await register(email, PASSWORD);
    expect(res.statusCode).toBe(201);
    registeredId = res.json().user.id;
    registeredCookie = sidValue(res);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `sid=${registeredCookie}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toEqual({ user: { id: registeredId, email } });
  });

  it('register stores a Session row whose tokenHash is sha256(cookie), never the raw token', async () => {
    const row = await app.prisma.session.findFirst({
      where: { tokenHash: createHash('sha256').update(registeredCookie).digest('hex') },
      select: { userId: true, expiresAt: true },
    });
    expect(row, 'register must write a Session row, or /me rejects the cookie').not.toBeNull();
    expect(row!.userId).toBe(registeredId);
    const raw = await app.prisma.session.findFirst({ where: { tokenHash: registeredCookie } });
    expect(raw).toBeNull();
  });

  it('register cookie has the same attributes as login: HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000', async () => {
    const res = await register(`${TAG}attrs-${Date.now()}@example.com`, PASSWORD);
    const sid = (Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']])
      .map(String)
      .find((c) => c.startsWith('sid='))!;
    expect(sid).toMatch(/(^|; )HttpOnly(;|$)/);
    expect(sid).toMatch(/SameSite=Lax/);
    expect(sid).toMatch(/Path=\//);
    expect(sid).toMatch(/Max-Age=2592000/);
  });

  it('a register session and a later login session both survive; logging out of one leaves the other', async () => {
    const loginRes = await login(email, PASSWORD);
    expect(loginRes.statusCode).toBe(200);
    const loginCookie = sidValue(loginRes);
    expect(loginCookie).not.toBe(registeredCookie);

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: `sid=${loginCookie}` } });
    expect(out.statusCode).toBe(204);

    const stillThere = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `sid=${registeredCookie}` } });
    expect(stillThere.statusCode).toBe(200);
    const gone = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `sid=${loginCookie}` } });
    expect(gone.statusCode).toBe(401);
  });

  it('logout of the register session ends it: me answers 401 afterwards', async () => {
    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: `sid=${registeredCookie}` } });
    expect(out.statusCode).toBe(204);
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: `sid=${registeredCookie}` } });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('UNAUTHENTICATED');
  });
});

describe('F-001: the sid cookie is found among other cookies', () => {
  it('a browser that sends other cookies alongside sid is still authenticated by /me', async () => {
    const res = await register(`${TAG}multi-${Date.now()}@example.com`, PASSWORD);
    const value = sidValue(res);
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `theme=dark; sid=${value}; lang=en` },
    });
    expect(me.statusCode).toBe(200);
  });

  it('a sid placed after an unrelated cookie with a similar name is not confused with it', async () => {
    const res = await register(`${TAG}similar-${Date.now()}@example.com`, PASSWORD);
    const value = sidValue(res);
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `xsid=decoy-000000000000000000000000; sid=${value}` },
    });
    expect(me.statusCode).toBe(200);
  });
});
