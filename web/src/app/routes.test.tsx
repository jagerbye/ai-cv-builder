// T-05 (CVB-5) — web route registry. Acceptance tests written before code.
// Contract the developer implements:
//   web/src/app/routes.ts exports
//     routes: RouteEntry[]                         one entry per feature
//     resolveRoute(pathname): RouteEntry | undefined
//   RouteEntry = { feature, path, branch: 'public' | 'protected', component }
//   web/src/features/<feature>/route.tsx default-exports an EMPTY placeholder
//   component (renders nothing). Later tasks fill these modules; the router
//   itself is never edited again.
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const FEATURES = ['auth', 'intake', 'generation', 'cv'] as const;

const sample = (path: string) => path.replace(/:[A-Za-z_]+/g, 'test-id');

async function loadRegistry() {
  return await import('./routes');
}

async function loadFeatureModule(feature: (typeof FEATURES)[number]) {
  switch (feature) {
    case 'auth':
      return await import('../features/auth/route');
    case 'intake':
      return await import('../features/intake/route');
    case 'generation':
      return await import('../features/generation/route');
    case 'cv':
      return await import('../features/cv/route');
  }
}

afterEach(() => cleanup());

describe('web route registry (T-05, CVB-5)', () => {
  it('declares one route entry per feature: auth, intake, generation, cv', async () => {
    const { routes } = await loadRegistry();
    expect(routes.map((r: { feature: string }) => r.feature).sort()).toEqual([...FEATURES].sort());
  });

  it('splits the routes into a public branch (auth) and a protected branch (intake, generation, cv)', async () => {
    const { routes } = await loadRegistry();
    const branchOf = Object.fromEntries(
      routes.map((r: { feature: string; branch: string }) => [r.feature, r.branch]),
    );
    expect(branchOf).toEqual({
      auth: 'public',
      intake: 'protected',
      generation: 'protected',
      cv: 'protected',
    });
  });

  it('gives every route a distinct absolute path', async () => {
    const { routes } = await loadRegistry();
    const paths: string[] = routes.map((r: { path: string }) => r.path);
    expect(new Set(paths).size).toBe(FEATURES.length);
    for (const p of paths) {
      expect(p.startsWith('/')).toBe(true);
    }
  });

  it.each(FEATURES)('points the %s route at the default export of its feature module', async (feature) => {
    const { routes } = await loadRegistry();
    const mod = await loadFeatureModule(feature);
    const entry = routes.find((r: { feature: string }) => r.feature === feature);
    expect(entry).toBeDefined();
    expect(typeof mod.default).toBe('function');
    expect(entry?.component).toBe(mod.default);
  });

  it.each(FEATURES)('the %s feature module is an empty placeholder that renders nothing', async (feature) => {
    const mod = await loadFeatureModule(feature);
    const Component = mod.default as () => null;
    const { container } = render(<Component />);
    expect(container.innerHTML).toBe('');
    cleanup();
  });

  it('resolves every declared route path to its own feature entry', async () => {
    const { routes, resolveRoute } = await loadRegistry();
    for (const r of routes as Array<{ feature: string; path: string }>) {
      const hit = resolveRoute(sample(r.path));
      expect(hit?.feature, `resolving ${r.path}`).toBe(r.feature);
    }
  });

  it('returns nothing for paths no route declares (negative cases)', async () => {
    const { resolveRoute } = await loadRegistry();
    expect(resolveRoute('/no-such-page')).toBeUndefined();
    expect(resolveRoute('/api/auth/me')).toBeUndefined();
  });
});
