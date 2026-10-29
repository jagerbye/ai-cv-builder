// QA-09 (sprint 001, lane B) — signing in from a deep link returns the visitor to
// the path they asked for, and a later plain visit to sign-in does not reuse it.
// Only fetch is stubbed; App, the router, the auth forms and the editor run for real.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { cvA } from '../cv/testkit';

const user = { id: 'u_1', email: 'ana@example.com' };
const UNAUTHENTICATED = { error: { code: 'UNAUTHENTICATED', message: 'Log in to continue.' } };

let signedIn = false;
let calls: string[] = [];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function api() {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.replace(/^\/api/, '');
      calls.push(`${method} ${path}`);
      if (path === '/auth/me') return signedIn ? json(200, { user }) : json(401, UNAUTHENTICATED);
      if (method === 'POST' && path === '/auth/login') {
        signedIn = true;
        return json(200, { user });
      }
      if (method === 'GET' && path === '/cvs/cv-1') return json(200, cvA());
      if (method === 'GET' && path === '/cvs') return json(200, { items: [] });
      return json(500, { error: { code: 'INTERNAL', message: 'unexpected request in test' } });
    }),
  );
}

async function open(path: string) {
  const { default: App } = await import('../../app/App');
  window.history.replaceState({}, '', path);
  render(<App />);
}

function signInWithForm() {
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: user.email } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'correct-horse-battery' } });
  fireEvent.submit(screen.getByLabelText(/email/i).closest('form')!);
}

beforeEach(() => {
  signedIn = false;
  api();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('sign-in keeps the requested destination (QA-09)', () => {
  it('after signing in from a deep link to a CV, lands on that CV and loads it', async () => {
    await open('/cvs/cv-1');
    await waitFor(() => expect(window.location.pathname).toBe('/auth/login'));
    signInWithForm();
    await waitFor(() => expect(window.location.pathname).toBe('/cvs/cv-1'));
    expect(calls).toContain('GET /cvs/cv-1');
    const fullName = (await screen.findByRole('textbox', { name: 'Full name' })) as HTMLInputElement;
    expect(fullName.value).toBe('Ana Lovelace');
  });

  it('forgets the deep link once used: a later plain visit to sign-in lands on the list (negative case)', async () => {
    await open('/auth/login');
    await screen.findByLabelText(/password/i);
    signInWithForm();
    await waitFor(() => expect(window.location.pathname).toBe('/cvs'));
    expect(await screen.findByText('You have no CVs yet.')).toBeTruthy();
  });
});
