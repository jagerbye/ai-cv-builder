// QA-09 (sprint 001, lane B) — /auth is for signed-out visitors. A signed-in
// visitor who opens it goes to the CV list instead of seeing the form again.
// Only fetch is stubbed; App and the router run for real.
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

function api(signedIn: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = url.replace(/^\/api/, '');
      if (path === '/auth/me') {
        return signedIn
          ? json(200, { user })
          : json(401, { error: { code: 'UNAUTHENTICATED', message: 'Log in to continue.' } });
      }
      if (path === '/cvs') return json(200, { items: [listItem] });
      return json(500, { error: { code: 'INTERNAL', message: 'unexpected request in test' } });
    }),
  );
}

async function open(path: string) {
  const { default: App } = await import('../../app/App');
  window.history.replaceState({}, '', path);
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('signed-in visitor on /auth (QA-09)', () => {
  it('sends a signed-in visitor from /auth/login to the CV list instead of the form', async () => {
    api(true);
    await open('/auth/login');
    await waitFor(() => expect(window.location.pathname).toBe('/cvs'));
    expect(await screen.findByText('Payments backend')).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Log in' })).toBeNull();
  });

  it('sends a signed-in visitor from /auth/signup to the CV list instead of the form', async () => {
    api(true);
    await open('/auth/signup');
    await waitFor(() => expect(window.location.pathname).toBe('/cvs'));
    expect(await screen.findByText('Payments backend')).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
  });

  it('keeps the sign-in form for a signed-out visitor on /auth/login (negative control)', async () => {
    api(false);
    await open('/auth/login');
    expect(await screen.findByLabelText(/password/i)).toBeTruthy();
    expect(window.location.pathname).toBe('/auth/login');
  });
});
