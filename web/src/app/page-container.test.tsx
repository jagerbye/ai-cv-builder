// QA-12: one page container. Every screen root carries the shared `page` class,
// and exactly one stylesheet rule centres it.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ComponentType } from 'react';
import { cvA, installApi } from '../features/cv/testkit';
import LoginRoute from '../features/auth/route';
import IntakeRoute from '../features/intake/route';
import GenerationRoute from '../features/generation/route';
import CvRoute from '../features/cv/route';
import App from './App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function mount(path: string, Component: ComponentType) {
  window.history.replaceState({}, '', path);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );
}

function rootHasPage(container: HTMLElement) {
  const root = container.firstElementChild as HTMLElement;
  expect(root, 'a screen root rendered').toBeTruthy();
  expect(root.classList.contains('page')).toBe(true);
}

describe('every screen root uses the shared container class', () => {
  it('auth', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } })));
    const { container } = mount('/auth/login', LoginRoute);
    await waitFor(() => rootHasPage(container));
  });
  it('intake', () => {
    vi.stubGlobal('fetch', vi.fn());
    rootHasPage(mount('/cvs/new', IntakeRoute).container);
  });
  it('cv list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { items: [] })));
    const { container } = mount('/cvs', CvRoute);
    rootHasPage(container);
    await waitFor(() => rootHasPage(container));
  });
  it('cv editor', async () => {
    installApi([cvA()]);
    const { container } = mount('/cvs/cv-1', CvRoute);
    await waitFor(() => expect(container.querySelector('#cv-section-experience')).toBeTruthy());
    rootHasPage(container);
  });
  it('job screens (failed)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, { id: 'job-1', cvId: 'cv-1', status: 'failed', stage: null, attempt: 1, startedAt: null, finishedAt: null }),
      ),
    );
    const { container } = mount('/jobs/job-1', GenerationRoute);
    rootHasPage(container);
    await waitFor(() => expect(container.querySelector('button')).toBeTruthy());
    rootHasPage(container);
  });
  it('not found', () => {
    window.history.replaceState({}, '', '/nope');
    vi.stubGlobal('fetch', vi.fn());
    const { container } = render(<App />);
    rootHasPage(container.querySelector('main') as HTMLElement);
  });
});

describe('one container rule', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = join(here, '..');
  function css(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? css(p) : p.endsWith('.css') ? [p] : [];
    });
  }
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');

  it('defines .page once, centred, and nothing else centres with auto margins', () => {
    const files = css(src);
    const centring = files.filter((f) => /margin:\s*0\s+auto/.test(strip(readFileSync(f, 'utf8'))));
    expect(centring.map((f) => f.slice(src.length + 1))).toEqual(['app/shell.css']);
    const shell = strip(readFileSync(join(here, 'shell.css'), 'utf8'));
    expect(shell).toMatch(/\.page\s*\{[^}]*margin:\s*0\s+auto/);
  });
});
