import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';

// T-21 (CVB-19), F-010 and C-000. The error envelope must be installed on the /api context:
// unmatched paths and thrown errors answer { error: { code, message, details? } }, never Fastify's
// default body, a stack, a driver message or request content.
//
// The database URL points at a closed port and carries a password marker. Any authenticated
// route then throws inside its handler with a driver error, which is the leak F-010 forbids.
// Expected to be RED now: server.ts never calls installErrorEnvelope.

const DB_PASSWORD_MARKER = 'LEAK-MARKER-pw-7731';
const CONTENT_MARKER = 'CONTENT-MARKER-cv-4419';
process.env.DATABASE_URL = `postgresql://app_user:${DB_PASSWORD_MARKER}@127.0.0.1:1/unreachable`;
process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used-by-intake';

const { buildServer } = await import('../../api/src/server.js');

let app: FastifyInstance;
const cookie = `sid=${randomBytes(32).toString('base64url')}`;

function chars(n: number): string {
  const unit = 'Built payment APIs for retail clients in a team of six. ';
  return unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
}

function assertNoLeak(raw: string): void {
  expect(raw).not.toContain(DB_PASSWORD_MARKER);
  expect(raw).not.toMatch(/\bat\s+\S+\s+\(/); // stack frame
  expect(raw).not.toMatch(/\.(ts|js|mjs):\d+/); // source location
  expect(raw).not.toMatch(/prisma|ECONNREFUSED|127\.0\.0\.1|node_modules/i); // driver and provider detail
}

beforeAll(async () => {
  app = buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('C-000 envelope on unmatched paths under /api', () => {
  it('GET to an unknown path answers 404 with the NOT_FOUND envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/no-such-route' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('POST to an unknown path answers 404 with the same envelope, not Fastify default fields', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/cvs/abc/unknown/path', payload: {} });
    expect(res.statusCode).toBe(404);
    const body = res.json() as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['error']);
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });
});

describe('C-000 envelope on a handler that throws', () => {
  it('an authenticated read whose handler throws answers 500 INTERNAL with a fixed message', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
  });

  it('the 500 body carries no stack, no driver or provider message and no connection secret', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(500);
    assertNoLeak(res.body);
  });

  it('the 500 body on a jobs read carries no stack or connection secret', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/6f1d6a1e-2b1c-4a57-9d1e-0c2f3a4b5c6d',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
    assertNoLeak(res.body);
  });

  it('request content sent to a throwing handler is never echoed back', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ targetRole: 'Backend Engineer', sourceText: `${CONTENT_MARKER} ${chars(300)}` }),
    });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain(CONTENT_MARKER);
    assertNoLeak(res.body);
  });

  it('the envelope keys are exactly error, with only code, message and optional details inside', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const body = res.json() as { error: Record<string, unknown> };
    expect(Object.keys(body)).toEqual(['error']);
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message']);
  });
});


// The envelope is installed on the /api context by server.ts, not as a side effect of one route
// plugin. Today auth.ts installs it through its skip-override plugin, which the behaviour tests above
// cannot tell apart from server.ts installing it. This check pins the owner of the install.
describe('source: server.ts installs the envelope on the /api context', () => {
  it('imports installErrorEnvelope and calls it on the /api registration', () => {
    const src = readFileSync(new URL('../../api/src/server.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/import \{[^}]*\binstallErrorEnvelope\b[^}]*\} from '\.\/http\/errors\.js'/);
    expect(src).toMatch(/installErrorEnvelope\((api|app)\)/);
  });
});
