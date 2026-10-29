import { describe, it, expect, afterAll, afterEach, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { verifyPassword } from '../../api/src/core/auth/password';

// T-03 (CVB-3). Contract suite for C-001 (POST /api/auth/register) and the
// C-000 error envelope it depends on. Criteria from spec.md F-001 §3.1.
// Real Fastify app via buildServer(); real Postgres via DATABASE_URL, the same
// pattern as routes/health.test.ts. Nothing is mocked: the hash, the 409 and the
// stored row are the behaviour under test.
//
// Criterion coverage is listed in the lane log. Not covered here, on purpose:
//  - 429 RATE_LIMITED (C-001): no numeric limit for auth in any contract; it
//    belongs with the F-010 limiter (T-21).
//  - "409 response time does not differ measurably from 201" (F-001): timing is
//    not a stable unit-test assertion; it needs a load-level check.
//  - "a session is returned" beyond Set-Cookie: the session row and its
//    tokenHash belong to T-04 (login, sessions).

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const LIVE_URL = ORIGINAL_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';
const EMAIL_TAG = 'cvb-t3-';
const VALID_PASSWORD = 'correct-horse-battery-1';
const ERROR_CODES = [
  'VALIDATION', 'UNAUTHENTICATED', 'NOT_FOUND', 'CONFLICT', 'VERSION_CONFLICT',
  'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_SOURCE', 'RATE_LIMITED', 'LLM_UNAVAILABLE',
  'LLM_INVALID_OUTPUT', 'JOB_TIMEOUT', 'CONFIG_MISSING', 'INTERNAL',
];

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

let seq = 0;
function freshEmail(): string {
  seq += 1;
  return `${EMAIL_TAG}${Date.now()}-${seq}@example.com`;
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await loadServer(LIVE_URL);
});

afterAll(async () => {
  if (app) {
    await app.prisma.user.deleteMany({ where: { email: { contains: EMAIL_TAG } } });
    await app.close();
  }
});

function register(payload: unknown, raw?: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: { 'content-type': 'application/json' },
    payload: raw ?? JSON.stringify(payload),
  });
}

async function userRows(email: string) {
  return app.prisma.user.findMany({ where: { email } });
}

// C-000: every non-2xx body is { error: { code, message, details? } }, code
// from the closed enum, and nothing else at the top level.
function expectEnvelope(res: { statusCode: number; json: () => any }, code: string) {
  expect(res.statusCode).toBeGreaterThanOrEqual(400);
  const body = res.json();
  expect(Object.keys(body)).toEqual(['error']);
  expect(Object.keys(body.error).every((k) => ['code', 'message', 'details'].includes(k))).toBe(true);
  expect(ERROR_CODES).toContain(body.error.code);
  expect(body.error.code).toBe(code);
  expect(typeof body.error.message).toBe('string');
  expect(body.error.message.length).toBeGreaterThan(0);
  return body;
}

// Driver, stack and prompt text must never reach a client (C-000, errors.ts).
const LEAK = /stack|\bat .*\.(ts|js):\d+|prisma|postgres|ECONNREFUSED|127\.0\.0\.1|password|invocation|\.invalid/i;

describe('C-001 register: success path', () => {
  it('201 with exactly { user: { id, email } } and an httpOnly SameSite=Lax session cookie', async () => {
    const email = freshEmail();
    const res = await register({ email, password: VALID_PASSWORD });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(Object.keys(body)).toEqual(['user']);
    expect(Object.keys(body.user).sort()).toEqual(['email', 'id']);
    expect(body.user.email).toBe(email);
    expect(body.user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    const cookie = [].concat(res.headers['set-cookie'] as any ?? []).join('; ');
    expect(cookie).toMatch(/(^|;\s*)sid=[^;]+/);
    expect(cookie.toLowerCase()).toContain('httponly');
    expect(cookie.toLowerCase()).toContain('samesite=lax');
  });

  it('stores an argon2id hash, not the plaintext, and salts it per user', async () => {
    const a = freshEmail();
    const b = freshEmail();
    expect((await register({ email: a, password: VALID_PASSWORD })).statusCode).toBe(201);
    expect((await register({ email: b, password: VALID_PASSWORD })).statusCode).toBe(201);
    const [rowA] = await userRows(a);
    const [rowB] = await userRows(b);
    expect(rowA.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(rowA.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(await verifyPassword(VALID_PASSWORD, rowA.passwordHash)).toBe(true);
    expect(await verifyPassword('wrong-password-1', rowA.passwordHash)).toBe(false);
    expect(rowB.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(rowA.passwordHash).not.toContain(VALID_PASSWORD);
    expect(rowA.passwordHash).not.toBe(rowB.passwordHash);
  });
});

describe('C-001 register: duplicate email is 409 with a generic message', () => {
  it('409 CONFLICT when the same email registers twice', async () => {
    const email = freshEmail();
    expect((await register({ email, password: VALID_PASSWORD })).statusCode).toBe(201);
    const res = await register({ email, password: 'another-long-password-2' });
    const body = expectEnvelope(res, 'CONFLICT');
    expect(res.statusCode).toBe(409);
    expect(body.error.details).toBeUndefined();
  });

  it('the 409 message does not confirm the address exists or echo it', async () => {
    const email = freshEmail();
    await register({ email, password: VALID_PASSWORD });
    const res = await register({ email, password: VALID_PASSWORD });
    const body = expectEnvelope(res, 'CONFLICT');
    expect(body.error.message).not.toContain(email);
    expect(body.error.message).not.toMatch(/exist|taken|already|registered|in use/i);
  });

  it('treats a case-variant of an existing email as a duplicate (citext)', async () => {
    const email = freshEmail();
    expect((await register({ email, password: VALID_PASSWORD })).statusCode).toBe(201);
    const res = await register({ email: email.toUpperCase(), password: VALID_PASSWORD });
    expectEnvelope(res, 'CONFLICT');
    expect(res.statusCode).toBe(409);
    expect(await userRows(email)).toHaveLength(1);
  });

  it('the duplicate attempt neither creates a row nor replaces the original hash', async () => {
    const email = freshEmail();
    await register({ email, password: VALID_PASSWORD });
    const [before] = await userRows(email);
    await register({ email, password: 'replacement-password-99' });
    const rows = await userRows(email);
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash).toBe(before.passwordHash);
  });
});

describe('C-001 register: validation is 400 with field-level details', () => {
  const cases: Array<{ name: string; payload: Record<string, unknown>; path: string }> = [
    { name: 'malformed email', payload: { email: 'not-an-email', password: VALID_PASSWORD }, path: 'email' },
    { name: 'email with spaces', payload: { email: 'a b@example.com', password: VALID_PASSWORD }, path: 'email' },
    { name: 'missing email', payload: { password: VALID_PASSWORD }, path: 'email' },
    { name: 'password of 9 characters', payload: { email: 'x@example.com', password: '123456789' }, path: 'password' },
    { name: 'missing password', payload: { email: 'x@example.com' }, path: 'password' },
    { name: 'password of 201 characters', payload: { email: 'x@example.com', password: 'p'.repeat(201) }, path: 'password' },
  ];

  it.each(cases)('400 VALIDATION with a details entry for $path ($name), no user created', async ({ payload, path }) => {
    // The payload is sent exactly as written: rewriting it here would hide the invalid input under test.
    const res = await register(payload);
    const body = expectEnvelope(res, 'VALIDATION');
    expect(res.statusCode).toBe(400);
    expect(Array.isArray(body.error.details)).toBe(true);
    const hit = body.error.details.find((d: { path: string }) => d.path === path);
    expect(hit).toBeDefined();
    expect(typeof hit.message).toBe('string');
    if (typeof payload.email === 'string') expect(await userRows(payload.email)).toHaveLength(0);
  });

  it('a malformed JSON body is 400 VALIDATION in the envelope, not the framework default', async () => {
    const res = await register(undefined, '{"email": "x@example.com", "password": ');
    expectEnvelope(res, 'VALIDATION');
    expect(res.statusCode).toBe(400);
  });

  it('password boundary: 10 characters is accepted, 9 is rejected', async () => {
    const ok = await register({ email: freshEmail(), password: 'p'.repeat(10) });
    expect(ok.statusCode).toBe(201);
    const short = await register({ email: freshEmail(), password: 'p'.repeat(9) });
    expect(short.statusCode).toBe(400);
    expectEnvelope(short, 'VALIDATION');
  });

  it('password boundary: 200 characters is accepted, 201 is rejected', async () => {
    const ok = await register({ email: freshEmail(), password: 'q'.repeat(200) });
    expect(ok.statusCode).toBe(201);
    const long = await register({ email: freshEmail(), password: 'q'.repeat(201) });
    expect(long.statusCode).toBe(400);
    expectEnvelope(long, 'VALIDATION');
  });
});

describe('C-000 error envelope', () => {
  it('an unrouted /api path is 404 NOT_FOUND in the envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expectEnvelope(res, 'NOT_FOUND');
  });

  it('a database failure is 500 INTERNAL with no driver message, stack or connection target', async () => {
    const down = await loadServer('postgresql://user:pass@127.0.0.1:1/nope');
    try {
      const res = await down.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ email: freshEmail(), password: VALID_PASSWORD }),
      });
      expect(res.statusCode).toBe(500);
      expectEnvelope(res, 'INTERNAL');
      expect(res.body).not.toMatch(LEAK);
      expect(res.body).not.toContain(VALID_PASSWORD);
    } finally {
      await down.close();
    }
  });
});

describe('F-001: the plaintext password appears in no log, error or response', () => {
  const SECRET = 'Plaintext-Secret-7731-xyz';

  // Captures what the server writes to stdout/stderr during fn. Pino writes
  // through fs.writeSync on fd 1, so both channels are observed.
  async function captureOutput<T>(fn: () => Promise<T>): Promise<{ result: T; output: string }> {
    const chunks: string[] = [];
    const realWrite = process.stdout.write.bind(process.stdout);
    const realWriteSync = fs.writeSync;
    const realFsWrite = fs.write;
    const spyStdout = vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: any, ...rest: any[]) => {
      chunks.push(String(chunk));
      return (realWrite as any)(chunk, ...rest);
    }) as any);
    const spySync = vi.spyOn(fs, 'writeSync').mockImplementation(((fd: number, data: any, ...rest: any[]) => {
      if (fd === 1 || fd === 2) chunks.push(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      return (realWriteSync as any)(fd, data, ...rest);
    }) as any);
    // Pino's default destination (sonic-boom, sync: false) writes with async
    // fs.write, not writeSync, so that channel is observed too.
    const spyWrite = vi.spyOn(fs, 'write').mockImplementation(((fd: number, data: any, ...rest: any[]) => {
      if (fd === 1 || fd === 2) chunks.push(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      return (realFsWrite as any)(fd, data, ...rest);
    }) as any);
    try {
      const result = await fn();
      // Let queued async log writes reach the spy before it is restored.
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { result, output: chunks.join('\n') };
    } finally {
      spyStdout.mockRestore();
      spySync.mockRestore();
      spyWrite.mockRestore();
    }
  }

  it('absent from logs, 201, 400, 409 and malformed-JSON responses (headers and body)', async () => {
    const email = freshEmail();
    const { result, output } = await captureOutput(async () => {
      const ok = await register({ email, password: SECRET });
      const invalid = await register({ email: 'bad-email', password: SECRET });
      const dup = await register({ email, password: SECRET });
      const broken = await register(undefined, `{"email":"${freshEmail()}","password":"${SECRET}"`);
      return [ok, invalid, dup, broken];
    });
    const [ok, invalid, dup, broken] = result;
    expect(ok.statusCode).toBe(201);
    expect(invalid.statusCode).toBe(400);
    expect(dup.statusCode).toBe(409);
    expect(broken.statusCode).toBe(400);
    for (const res of result) {
      expect(res.body).not.toContain(SECRET);
      expect(JSON.stringify(res.headers)).not.toContain(SECRET);
    }
    // Guard against a vacuous pass: the capture must have seen request logging.
    expect(output.length).toBeGreaterThan(0);
    expect(output).not.toContain(SECRET);
  });
});

describe('C-000 envelope reaches sibling /api plugins', () => {
  it('unmatched /api path answers the NOT_FOUND envelope', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/no-such-route-here' });
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('malformed JSON to a sibling route (POST /api/cvs) answers a VALIDATION envelope, not the Fastify default', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/cvs',
      headers: { 'content-type': 'application/json' },
      payload: '{"broken":',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(Object.keys(body)).toEqual(['error']);
    expect(body.error.code).toBe('VALIDATION');
    expect(ERROR_CODES).toContain(body.error.code);
    expect(body.error).not.toHaveProperty('stack');
  });
});

