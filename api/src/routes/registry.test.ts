import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-07 (CVB-24, ADR-011). The route registry: five empty, registered Fastify
// plugins under /api, one per lane. Each route file is loaded through a literal
// dynamic import, so a missing file fails as "Failed to load url" (missing
// module), not as an assertion. Registration is read from server.ts source,
// because an empty plugin adds no route that could be observed over HTTP.

const ROUTES = ['auth', 'cvs-create', 'jobs', 'cvs', 'export'] as const;

const PLUGINS: Record<(typeof ROUTES)[number], string> = {
  auth: 'authRoutes',
  'cvs-create': 'cvsCreateRoutes',
  jobs: 'jobsRoutes',
  cvs: 'cvsRoutes',
  export: 'exportRoutes',
};

const LOADERS: Record<(typeof ROUTES)[number], () => Promise<Record<string, unknown>>> = {
  auth: () => import('./auth.js'),
  'cvs-create': () => import('./cvs-create.js'),
  jobs: () => import('./jobs.js'),
  cvs: () => import('./cvs.js'),
  export: () => import('./export.js'),
};

const serverSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'server.ts'),
  'utf8',
);

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const DB_URL = ORIGINAL_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/ai_cv_builder';

afterEach(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
});

describe('route registry (T-07): plugin modules exist', () => {
  it.each(ROUTES)('routes/%s.ts loads and exports a plugin function', async (name) => {
    const mod = await LOADERS[name]();
    const fns = Object.values(mod).filter((v) => typeof v === 'function');
    expect(fns.length).toBeGreaterThanOrEqual(1);
  });
});

describe('route registry (T-07): server.ts registers all five under /api', () => {
  it.each(ROUTES)('server.ts imports routes/%s.js', (name) => {
    expect(serverSource).toContain(`./routes/${name}.js`);
  });

  // Strip comments so a commented-out register call does not count.
  const code = serverSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it.each(ROUTES)('server.ts calls api.register for %s', (name) => {
    const fn = PLUGINS[name];
    expect(code).toMatch(new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*from\\s*'\\./routes/${name}\\.js'`));
    // A plugin may take an options object (cvsRoutes carries the generation pipeline); the call itself is what is pinned.
    expect(code).toMatch(new RegExp(`await\\s+api\\.register\\(\\s*${fn}\\s*(?:,\\s*\\{[^}]*\\})?\\s*\\)`));
  });

  it('registers the route plugins with prefix /api', () => {
    const prefixed = serverSource.match(/prefix:\s*'\/api'/g) ?? [];
    expect(prefixed.length).toBeGreaterThanOrEqual(1);
    expect(serverSource).toMatch(/\{\s*prefix:\s*'\/api'\s*\}/);
  });

  it('health stays registered alongside the five route plugins', () => {
    expect(serverSource).toContain('./routes/health.js');
    expect(serverSource).toContain('registerHealthRoute(api)');
  });
});

describe('route registry (T-07): empty plugins add no handler', () => {
  it('an unrouted path under /api answers 404 (no catch-all in the registry)', async () => {
    process.env.DATABASE_URL = DB_URL;
    vi.resetModules();
    const { buildServer } = await import('../server.js');
    const app = buildServer();
    try {
      const res = await app.inject({ method: 'GET', url: '/api/__registry_probe__' });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

afterAll(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
});
