import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from 'vitest';

// T-02 (B-002, F-010). Real Fastify app via buildServer(); real Postgres via
// DATABASE_URL (never mocked: the health criterion is about the real database).
// The "unreachable DB" case points DATABASE_URL at a closed port, which is a real
// connection failure, not a stub.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
// Captured once, before any test mutates process.env (loadServer overwrites
// DATABASE_URL). Fallback matches the db service in docker-compose.yml.
const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const LIVE_URL = ORIGINAL_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test';

afterEach(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
});

async function loadServer(databaseUrl: string) {
  vi.resetModules();
  process.env.DATABASE_URL = databaseUrl;
  const mod = await import('../server');
  return mod.buildServer();
}

describe('GET /api/health', () => {
  const liveUrl = LIVE_URL;
  let app: Awaited<ReturnType<typeof loadServer>> | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it('returns 200 with exactly { ok: true, db: true } when the database answers', async () => {
    app = await loadServer(liveUrl);
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, db: true });
  });

  it('returns db: false when the database is unreachable (not a 500 with a stack trace)', async () => {
    app = await loadServer('postgresql://user:pass@127.0.0.1:1/nope');
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    const body = res.json();
    expect(res.statusCode).toBe(503);
    expect(body).toEqual({ ok: false, db: false });
    expect(JSON.stringify(body)).not.toMatch(/stack|at .*\.ts:|password/i);
  });
});

describe('F-010: the api boots with ANTHROPIC_API_KEY unset', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = LIVE_URL;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  });

  it('buildServer() resolves and serves health while the key is absent', async () => {
    const app = await loadServer(LIVE_URL);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, db: true });
    } finally {
      await app.close();
    }
  });

  it('the env module reports the key as undefined rather than throwing at import', async () => {
    vi.resetModules();
    const env = await import('../env');
    expect(env.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.env.DATABASE_URL).toBeTruthy();
  });
});
