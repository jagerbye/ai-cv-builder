// T-04 reopened (CVB-4), ADR-012. Black-box session flow against the RUNNING API
// container: register, me, logout, me, login. Runs only when CONTAINER_API_URL is set,
// e.g. CONTAINER_API_URL=http://127.0.0.1:3000 after `docker compose up -d --build`.
// It is skipped (not passed) otherwise, so a lane gate on the host does not claim
// container evidence. The lane log records the command and result.
import { describe, it, expect } from 'vitest';

const BASE = process.env.CONTAINER_API_URL;
const PASSWORD = 'correct-horse-battery-container';

function cookieFrom(res: Response): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  const sid = raw.find((c) => c.startsWith('sid='));
  expect(sid, 'a sid Set-Cookie header must be present').toBeDefined();
  return sid!.split(';')[0];
}

describe.skipIf(!BASE)('container: session flow through the running api image (ADR-012)', () => {
  const email = `cvb-t4ctr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  let cookie: string;

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it('register answers 201 (not 500: argon2 runs in the container) with a sid cookie', async () => {
    const res = await post('/api/auth/register', { email, password: PASSWORD });
    expect(res.status).toBe(201);
    cookie = cookieFrom(res);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.email).toBe(email);
  });

  it('the register cookie is accepted by GET /api/auth/me in the container', async () => {
    const res = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { email: string } }).user.email).toBe(email);
  });

  it('logout answers 204 and the same cookie is then 401 on /api/auth/me', async () => {
    const out = await post('/api/auth/logout', {}, { cookie });
    expect(out.status).toBe(204);
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie } });
    expect(me.status).toBe(401);
    expect(((await me.json()) as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('login with the same credentials answers 200 and a cookie that /me accepts', async () => {
    const res = await post('/api/auth/login', { email, password: PASSWORD });
    expect(res.status).toBe(200);
    const fresh = cookieFrom(res);
    const me = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: fresh } });
    expect(me.status).toBe(200);
  });

  it('a wrong password in the container is 401 with the same envelope as an unknown email', async () => {
    const wrong = await post('/api/auth/login', { email, password: 'not-the-password-at-all' });
    const unknown = await post('/api/auth/login', { email: `nobody-${email}`, password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.text()).toBe(await unknown.text());
  });
});
