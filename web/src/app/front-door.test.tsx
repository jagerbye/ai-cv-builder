// QA-02 (sprint 001, lane B) — the front door. "/" must not be a 404: a signed-out
// visitor goes to sign-in, a signed-in visitor goes to the CV list. Only fetch is
// stubbed; App and the router run for real.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const user = { id: 'u_1', email: 'ana@example.com' };
const listItem = {
  id: 'cv-a1',
  title: 'Payments backend',
  targetRole: 'Senior backend engineer',
  state: 'ready',
  updatedAt: '2026-10-27T09:00:00.000Z',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function api(signedIn: () => boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = url.replace(/^\/api/, '');
      if (path === '/auth/me') {
        return signedIn()
          ? json(200, { user })
          : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Log in to continue.' } });
      }
      if (path === '/cvs') return json(200, { items: [listItem] });
      return json(500, { error: { code: 'INTERNAL', message: 'unexpected request in test' } });
    }),
  );
}

async function open(path: string) {
  const { default: App } = await import('./App');
  window.history.replaceState({}, '', path);
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('front door (QA-02)', () => {
  it('sends a signed-out visitor from / to the sign-in form, not a not-found page', async () => {
    api(() => false);
    await open('/');
    await waitFor(() => expect(window.location.pathname).toBe('/auth/login'));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
  });

  it('sends a signed-in visitor from / to the CV list, not a not-found page', async () => {
    api(() => true);
    await open('/');
    await waitFor(() => expect(window.location.pathname).toBe('/cvs'));
    expect(await screen.findByText('Payments backend')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).toBeNull();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });
});
