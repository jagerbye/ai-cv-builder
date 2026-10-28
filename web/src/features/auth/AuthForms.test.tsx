// T-06 (CVB-6) — sign-up and log-in forms, spec.md §3.1 and C-001 / C-002.
// Only the network is stubbed (fetch); the App, router registry and T-05 client
// run for real. Routes assumed: /auth/login and /auth/signup (see report).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

type Reply = { status: number; body?: unknown };
interface Call { method: string; path: string; body?: unknown }

function api(handler: (method: string, path: string) => Reply) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.replace(/^\/api/, '');
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const reply = handler(method, path);
      if (reply.status === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: reply.status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  return { calls };
}

const meAnonymous: Reply = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Log in to continue.' } },
};

function fieldFor(label: RegExp): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function errorTextFor(input: HTMLInputElement): string {
  const id = input.getAttribute('aria-describedby');
  expect(id, 'field must point at its error text via aria-describedby').toBeTruthy();
  return document.getElementById(id!)?.textContent ?? '';
}

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

describe('sign-up form (C-001, CVB-6)', () => {
  it('posts the email and password to POST /api/auth/register', async () => {
    const { calls } = api((method, path) => {
      if (path === '/auth/me') return meAnonymous;
      if (method === 'POST' && path === '/auth/register') {
        return { status: 201, body: { user: { id: 'u_1', email: 'ana@example.com' } } };
      }
      return { status: 500 };
    });
    await open('/auth/signup');
    fireEvent.change(fieldFor(/email/i), { target: { value: 'ana@example.com' } });
    fireEvent.change(fieldFor(/password/i), { target: { value: 'correct-horse-battery' } });
    fireEvent.submit(fieldFor(/email/i).closest('form')!);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')).toEqual({
        method: 'POST',
        path: '/auth/register',
        body: { email: 'ana@example.com', password: 'correct-horse-battery' },
      }),
    );
  });

  it('marks each field named in a 400 details array with its own inline message', async () => {
    api((method, path) => {
      if (path === '/auth/me') return meAnonymous;
      if (method === 'POST' && path === '/auth/register') {
        return {
          status: 400,
          body: {
            error: {
              code: 'VALIDATION',
              message: 'Some fields are invalid.',
              details: [
                { path: 'email', message: 'Enter a valid email address.' },
                { path: 'password', message: 'Use at least 10 characters.' },
              ],
            },
          },
        };
      }
      return { status: 500 };
    });
    await open('/auth/signup');
    fireEvent.change(fieldFor(/email/i), { target: { value: 'not-an-email' } });
    fireEvent.change(fieldFor(/password/i), { target: { value: 'short' } });
    fireEvent.submit(fieldFor(/email/i).closest('form')!);

    await waitFor(() => expect(fieldFor(/email/i).getAttribute('aria-invalid')).toBe('true'));
    expect(errorTextFor(fieldFor(/email/i))).toBe('Enter a valid email address.');
    expect(fieldFor(/password/i).getAttribute('aria-invalid')).toBe('true');
    expect(errorTextFor(fieldFor(/password/i))).toBe('Use at least 10 characters.');
    expect(window.location.pathname).toBe('/auth/signup');
  });

  it('shows the envelope message in an alert for 409 and marks no field as invalid', async () => {
    api((method, path) => {
      if (path === '/auth/me') return meAnonymous;
      if (method === 'POST' && path === '/auth/register') {
        return {
          status: 409,
          body: { error: { code: 'CONFLICT', message: 'Could not create an account with these details.' } },
        };
      }
      return { status: 500 };
    });
    await open('/auth/signup');
    fireEvent.change(fieldFor(/email/i), { target: { value: 'taken@example.com' } });
    fireEvent.change(fieldFor(/password/i), { target: { value: 'correct-horse-battery' } });
    fireEvent.submit(fieldFor(/email/i).closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Could not create an account with these details.');
    expect(fieldFor(/email/i).getAttribute('aria-invalid')).not.toBe('true');
    expect(fieldFor(/password/i).getAttribute('aria-invalid')).not.toBe('true');
  });
});

describe('log-in form (C-002, CVB-6)', () => {
  it('posts credentials to POST /api/auth/login', async () => {
    const { calls } = api((method, path) => {
      if (path === '/auth/me') return meAnonymous;
      if (method === 'POST' && path === '/auth/login') {
        return { status: 200, body: { user: { id: 'u_1', email: 'ana@example.com' } } };
      }
      return { status: 500 };
    });
    await open('/auth/login');
    fireEvent.change(fieldFor(/email/i), { target: { value: 'ana@example.com' } });
    fireEvent.change(fieldFor(/password/i), { target: { value: 'correct-horse-battery' } });
    fireEvent.submit(fieldFor(/email/i).closest('form')!);
    await waitFor(() =>
      expect(calls.find((c) => c.path === '/auth/login')).toEqual({
        method: 'POST',
        path: '/auth/login',
        body: { email: 'ana@example.com', password: 'correct-horse-battery' },
      }),
    );
  });

  it('shows the generic 401 message in an alert and stays on the login screen', async () => {
    api((method, path) => {
      if (path === '/auth/me') return meAnonymous;
      if (method === 'POST' && path === '/auth/login') {
        return { status: 401, body: { error: { code: 'UNAUTHENTICATED', message: 'Email or password is incorrect.' } } };
      }
      return { status: 500 };
    });
    await open('/auth/login');
    fireEvent.change(fieldFor(/email/i), { target: { value: 'ana@example.com' } });
    fireEvent.change(fieldFor(/password/i), { target: { value: 'wrong-password-here' } });
    fireEvent.submit(fieldFor(/email/i).closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Email or password is incorrect.');
    expect(window.location.pathname).toBe('/auth/login');
  });
});
