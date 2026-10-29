// Sprint 001 QA-01 acceptance: a browser on the HOST PORT reaches the api on the
// SAME origin. Starts nothing: it assumes `docker compose up -d --wait` has run.
// Real HTTP against the web origin (SMOKE_WEB_URL, default http://127.0.0.1:$WEB_PORT
// or 5273). If the web origin does not answer, the whole suite SKIPS with a message,
// so a machine with nothing running stays green.
import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WEB = (process.env.SMOKE_WEB_URL ?? `http://127.0.0.1:${process.env.WEB_PORT ?? '5273'}`).replace(/\/$/, '');
const PASSWORD = 'correct-horse-battery-1';
const EMAIL_TAG = 'cvb-smoke-';

async function stackUp(): Promise<boolean> {
  try {
    const r = await fetch(`${WEB}/`, { signal: AbortSignal.timeout(3_000) });
    return r.ok;
  } catch {
    return false;
  }
}

const up = await stackUp();
if (!up) {
  console.warn(`smoke: SKIPPED — nothing answers at ${WEB}. Run \`docker compose up -d --wait\` to run this suite.`);
}

// Users created by this suite, by the ids the register response returned (E-005).
const createdUserIds: string[] = [];

function sidCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith('sid='));
}

afterAll(async () => {
  if (createdUserIds.length === 0) return;
  const requireFromApi = createRequire(resolve(rootDir, 'api', 'package.json'));
  const { PrismaClient } = requireFromApi('@prisma/client') as typeof import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: {
      db: { url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder' },
    },
  });
  try {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  } finally {
    await prisma.$disconnect();
  }
});

describe.skipIf(!up)(`stack smoke through the web origin (${WEB})`, () => {
  it('serves the SPA shell on the host port', async () => {
    const res = await fetch(`${WEB}/`, { signal: AbortSignal.timeout(5_000) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(await res.text()).toContain('<div id="root">');
  });

  it('answers /api/health as JSON through the web origin (not the SPA HTML)', async () => {
    const res = await fetch(`${WEB}/api/health`, { signal: AbortSignal.timeout(5_000) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ ok: true, db: true });
  });

  it('register, then login, through the web origin each set a session cookie', async () => {
    const email = `${EMAIL_TAG}${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const body = JSON.stringify({ email, password: PASSWORD });
    const headers = { 'content-type': 'application/json' };

    const reg = await fetch(`${WEB}/api/auth/register`, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10_000),
    });
    expect(reg.status).toBe(201);
    const regJson = (await reg.json()) as { user: { id: string; email: string } };
    createdUserIds.push(regJson.user.id);
    expect(sidCookie(reg)).toMatch(/^sid=[^;]+/);

    const login = await fetch(`${WEB}/api/auth/login`, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(10_000),
    });
    expect(login.status).toBe(200);
    expect(((await login.json()) as { user: { id: string } }).user.id).toBe(regJson.user.id);
    expect(sidCookie(login)).toMatch(/^sid=[^;]+/);
  });
});
