// Signed-in navigation. The header shows the nav only when /auth/me says there
// is a session; the current location is marked in markup (aria-current), not by colour.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import App from './App';

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubApi(signedIn: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/auth/me') {
        return signedIn
          ? json(200, { user: { id: 'u1', email: 'a@b.c' } })
          : json(401, { error: { code: 'UNAUTHENTICATED', message: 'no' } });
      }
      if (url === '/api/cvs') return json(200, { items: [] });
      return json(404, { error: { code: 'NOT_FOUND', message: 'no' } });
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

async function openSignedIn(path: string) {
  stubApi(true);
  window.history.replaceState({}, '', path);
  render(<App />);
  return screen.findByRole('navigation', { name: 'Main' });
}

describe('header navigation', () => {
  it('signed-out visitor sees the brand and no nav, no links', async () => {
    stubApi(false);
    window.history.replaceState({}, '', '/auth/login');
    render(<App />);
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    const banner = screen.getByRole('banner');
    expect(banner.textContent).toContain('AI CV Builder');
    expect(within(banner).queryByRole('navigation')).toBeNull();
    expect(within(banner).queryAllByRole('link')).toHaveLength(0);
  });

  it('signed-in nav links to the CV list and to a new CV, in that order, before Log out', async () => {
    const nav = await openSignedIn('/cvs');
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['My CVs', '/cvs'],
      ['New CV', '/cvs/new'],
    ]);
    const banner = screen.getByRole('banner');
    const tabbables = Array.from(banner.querySelectorAll('a, button'));
    expect(tabbables.map((e) => e.textContent)).toEqual(['My CVs', 'New CV', 'Log out']);
  });

  it('marks the list as the current page on /cvs and nothing else', async () => {
    const nav = await openSignedIn('/cvs');
    expect(within(nav).getByRole('link', { name: 'My CVs' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'New CV' }).hasAttribute('aria-current')).toBe(false);
  });

  it('marks New CV as the current page on /cvs/new and not the list', async () => {
    const nav = await openSignedIn('/cvs/new');
    expect(within(nav).getByRole('link', { name: 'New CV' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'My CVs' }).hasAttribute('aria-current')).toBe(false);
  });

  it('marks the list as the current section (not page) while editing a CV', async () => {
    const nav = await openSignedIn('/cvs/cv-1');
    expect(within(nav).getByRole('link', { name: 'My CVs' }).getAttribute('aria-current')).toBe('true');
    expect(within(nav).getByRole('link', { name: 'New CV' }).hasAttribute('aria-current')).toBe(false);
  });

  it('marks nothing on the progress view', async () => {
    const nav = await openSignedIn('/jobs/job-1');
    expect(nav.querySelectorAll('[aria-current]')).toHaveLength(0);
  });
});
