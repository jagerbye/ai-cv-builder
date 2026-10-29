// T-06 (CVB-6) — session behaviour, spec.md §3.1 and C-002 (me, logout).
// fetch is the only stub; App, routes and the T-05 client run for real.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

type Reply = { status: number; body?: unknown } | 'pending';
interface Call { method: string; path: string }

function api(handler: (method: string, path: string) => Reply) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.replace(/^\/api/, '');
      calls.push({ method, path });
      // C-007 (GET /api/cvs) answers an empty list unless a test asks otherwise.
      const reply: Reply | 'pending' = path === '/cvs' ? { status: 200, body: { items: [] } } : handler(method, path);
      if (reply === 'pending') return new Promise<Response>(() => {});
      if (reply.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return { calls };
}

const user = { id: 'u_1', email: 'ana@example.com' };
const meSignedIn: Reply = { status: 200, body: { user } };
const meAnonymous: Reply = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Log in to continue.' } },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

async function open(path: string) {
  const { default: App } = await import('../../app/App');
  window.history.replaceState({}, '', path);
  render(<App />);
}

const newCvLink = () => document.querySelector('a[href="/cvs/new"]');

describe('session on mount (C-002 me, CVB-6)', () => {
  it('calls GET /api/auth/me once on mount', async () => {
    const { calls } = api((_m, path) => (path === '/auth/me' ? meSignedIn : { status: 500 }));
    await open('/cvs');
    await waitFor(() => expect(calls.filter((c) => c.path === '/auth/me')).toHaveLength(1));
    expect(calls.find((c) => c.path === '/auth/me')?.method).toBe('GET');
  });

  it('keeps a signed-in user on /cvs after a reload (no redirect to login)', async () => {
    api((_m, path) => (path === '/auth/me' ? meSignedIn : { status: 500 }));
    await open('/cvs');
    await waitFor(() => expect(newCvLink()).not.toBeNull());
    expect(window.location.pathname).toBe('/cvs');
    expect(screen.queryByRole('button', { name: /log ?in/i })).toBeNull();
  });

  it('renders the empty state for a signed-in user with no CVs: a heading and a link to /cvs/new', async () => {
    api((_m, path) => (path === '/auth/me' ? meSignedIn : { status: 500 }));
    await open('/cvs');
    await waitFor(() => expect(newCvLink()).not.toBeNull());
    const main = screen.getByRole('main');
    expect(main.querySelector('h1, h2')?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    expect(main.querySelectorAll('article, li').length).toBe(0);
  });
});

describe('protected branch guard (spec §3.1, CVB-6)', () => {
  it('shows no protected content while /me is pending', async () => {
    api((_m, path) => (path === '/auth/me' ? 'pending' : { status: 500 }));
    await open('/cvs');
    expect(newCvLink()).toBeNull();
    expect(window.location.pathname).toBe('/cvs');
  });

  it('redirects an unauthenticated visitor from /cvs to /auth/login', async () => {
    api((_m, path) => (path === '/auth/me' ? meAnonymous : { status: 500 }));
    await open('/cvs');
    await waitFor(() => expect(window.location.pathname).toBe('/auth/login'));
    expect(screen.getByRole('button', { name: /log ?in/i })).toBeTruthy();
  });

  it('never paints protected content during the redirect (no flash)', async () => {
    api((_m, path) => (path === '/auth/me' ? meAnonymous : { status: 500 }));
    const flashed: boolean[] = [];
    const observer = new MutationObserver(() => flashed.push(newCvLink() !== null));
    observer.observe(document.body, { subtree: true, childList: true, attributes: true });
    await open('/cvs');
    await waitFor(() => expect(window.location.pathname).toBe('/auth/login'));
    observer.disconnect();
    expect(flashed.some(Boolean)).toBe(false);
  });
});

describe('logout (C-002, CVB-6)', () => {
  it('POSTs /api/auth/logout, returns to the public branch and drops the cached user', async () => {
    let signedIn = true;
    const { calls } = api((method, path) => {
      if (path === '/auth/me') return signedIn ? meSignedIn : meAnonymous;
      if (method === 'POST' && path === '/auth/logout') {
        signedIn = false;
        return { status: 204 };
      }
      return { status: 500 };
    });
    await open('/cvs');
    await waitFor(() => expect(newCvLink()).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /log ?out/i }));

    await waitFor(() => expect(window.location.pathname).toBe('/auth/login'));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/auth/logout')).toBe(true);
    expect(screen.getByRole('button', { name: /log ?in/i })).toBeTruthy();
    expect(newCvLink()).toBeNull();
  });
});

describe('log-in success (C-002, CVB-6)', () => {
  it('after a 200 from POST /api/auth/login the visitor reaches /cvs without reloading', async () => {
    let signedIn = false;
    api((method, path) => {
      if (path === '/auth/me') return signedIn ? meSignedIn : meAnonymous;
      if (method === 'POST' && path === '/auth/login') {
        signedIn = true;
        return { status: 200, body: { user } };
      }
      return { status: 500 };
    });
    await open('/auth/login');
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'correct-horse-battery' } });
    fireEvent.submit(screen.getByLabelText(/email/i).closest('form')!);
    await waitFor(() => expect(window.location.pathname).toBe('/cvs'));
    await waitFor(() => expect(newCvLink()).not.toBeNull());
  });
});
