// T-05 (CVB-5) — typed API client. Contract the developer implements:
//   web/src/api/client.ts exports
//     apiFetch<T>(path, init?: { method?, body?: unknown }): Promise<T>
//     class ApiError extends Error { status; code; details?: {path,message}[] }
// Parses the C-000 error envelope { error: { code, message, details? } }.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, ApiError } from './client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('typed API client (C-000, CVB-5)', () => {
  it('prefixes /api, sends cookies, and returns the parsed body on 2xx', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { user: { id: 'u_42', email: 'ana@example.com' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await apiFetch<{ user: { id: string; email: string } }>('/auth/me');
    expect(out).toEqual({ user: { id: 'u_42', email: 'ana@example.com' } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/auth/me');
    expect(['include', 'same-origin']).toContain(init.credentials);
  });

  it('sends an object body as JSON with a JSON content type', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { user: { id: 'u_1', email: 'a@b.co' } }));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/auth/register', { method: 'POST', body: { email: 'a@b.co', password: 'correct-horse' } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'a@b.co', password: 'correct-horse' });
    expect(new Headers(init.headers).get('content-type')).toContain('application/json');
  });

  it('parses a 400 VALIDATION envelope into code, message and the details array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(400, {
          error: {
            code: 'VALIDATION',
            message: 'Check the highlighted fields.',
            details: [
              { path: 'password', message: 'Must be at least 10 characters' },
              { path: 'email', message: 'Not a valid email' },
            ],
          },
        }),
      ),
    );
    const err = await apiFetch('/auth/register', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.status).toBe(400);
    expect(e.code).toBe('VALIDATION');
    expect(e.message).toBe('Check the highlighted fields.');
    expect(e.details).toEqual([
      { path: 'password', message: 'Must be at least 10 characters' },
      { path: 'email', message: 'Not a valid email' },
    ]);
  });

  it('returns a CONFLICT envelope without details as undefined details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(409, { error: { code: 'CONFLICT', message: 'Email already registered' } }),
      ),
    );
    const e = (await apiFetch('/auth/register', { method: 'POST', body: {} }).catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe('CONFLICT');
    expect(e.message).toBe('Email already registered');
    expect(e.details).toBeUndefined();
  });

  it('does not leak a non-envelope 401 body into the message (negative case)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'raw provider secret text' })));
    const e = (await apiFetch('/auth/me').catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(401);
    expect(e.message).not.toContain('raw provider secret text');
    expect(e.details).toBeUndefined();
  });

  it('turns a non-JSON 500 body into an INTERNAL ApiError without echoing the body (negative case)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>stack trace at handler.js:12</html>', { status: 500 })),
    );
    const e = (await apiFetch('/cvs').catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(500);
    expect(e.code).toBe('INTERNAL');
    expect(e.message).not.toContain('stack trace');
  });
});
