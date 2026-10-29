// T-05 (CVB-5) — web route registry. Acceptance tests written before code.
// Contract the developer implements:
//   web/src/app/routes.ts exports
//     routes: RouteEntry[]                         one entry per feature
//     resolveRoute(pathname): RouteEntry | undefined
//   RouteEntry = { feature, path, branch: 'public' | 'protected', component }
//   web/src/features/<feature>/route.tsx default-exports the feature's screen.
//   T-05 shipped these as empty placeholders; T-06/T-13/T-14 filled them in,
//   so the registry is now proven by rendering the real screens (see the
//   SPRINT-001 integration notes). The router itself is never edited again.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor, within } from '@testing-library/react';
import type { ComponentType } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cvA, installApi } from '../features/cv/testkit';

const FEATURES = ['auth', 'intake', 'generation', 'cv'] as const;
type Feature = (typeof FEATURES)[number];

// A concrete pathname for a pattern: `:param` and a trailing `*` become a segment.
const sample = (path: string) => path.replace(/:[A-Za-z_]+/g, 'test-id').replace(/\*$/, 'test-id');

// What each real screen must put on the page when mounted at its own path.
// Structural markers, not copy: the feature suites own the wording.
// The cv marker is the editor's Experience section. The error and pending states
// of /cvs/:id have no such section, so it proves the loaded editor rendered.
const SCREEN_MARKER: Record<Feature, string> = {
  auth: 'form',
  intake: 'form',
  generation: '[role="status"], [role="alert"]',
  cv: '#cv-section-experience',
};

// Screens may call the API on mount; the network is the only external and is
// stubbed with the C-000 NOT_FOUND envelope so nothing leaves the process.
// The cv route is the exception: it is stubbed with a successful C-006 read
// (testkit's installApi) so the loaded editor, not its error state, is mounted.
function stubNetwork() {
  const body = JSON.stringify({ error: { code: 'NOT_FOUND', message: 'No such route.' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: 404, headers: { 'content-type': 'application/json' } })),
  );
}

function mountAt(pathname: string, Component: ComponentType) {
  window.history.replaceState({}, '', pathname);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
}

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

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

  it.each(FEATURES)('resolving a %s path yields a component that renders the real %s screen', async (feature) => {
    if (feature === 'cv') installApi([{ ...cvA(), id: 'test-id' }]);
    else stubNetwork();
    const { routes, resolveRoute } = await loadRegistry();
    const entry = routes.find((r: { feature: string }) => r.feature === feature);
    expect(entry).toBeDefined();
    const pathname = sample(entry!.path);
    const hit = resolveRoute(pathname);
    expect(hit?.component, `resolving ${pathname}`).toBe(entry!.component);

    const { container } = mountAt(pathname, hit!.component);
    // The cv query resolves after mount; the other screens render synchronously.
    await waitFor(() =>
      expect(container.querySelector(SCREEN_MARKER[feature]), `${feature} screen marker`).not.toBeNull(),
    );
    // Not the T-05 placeholder any more: a real screen with its own landmark.
    expect(container.innerHTML).not.toBe('');
    expect(container.textContent?.trim().length).toBeGreaterThan(0);
    if (feature === 'cv') {
      // The stored CV's contact value, so the editor shows the server's data.
      expect(within(container).getByRole('textbox', { name: 'Full name' })).toHaveProperty('value', 'Ana Lovelace');
    }
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
