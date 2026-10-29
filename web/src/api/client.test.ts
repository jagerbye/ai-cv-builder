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

// T-22 (CVB-15) — the editor depends on these client behaviours (C-008, C-000).
describe('typed API client — PATCH and version conflicts (C-008, T-22)', () => {
  it('sends PATCH with a JSON body of {version, patch} and returns the parsed 200 body', async () => {
    const saved = { id: 'cv-1', version: 8, contact: { links: [], email: 'a@b.co' } };
    const fetchMock = vi.fn(async () => jsonResponse(200, saved));
    vi.stubGlobal('fetch', fetchMock);
    const out = await apiFetch<typeof saved>('/cvs/cv-1', {
      method: 'PATCH',
      body: { version: 7, patch: { contact: { links: [], email: 'a@b.co' } } },
    });
    expect(out).toEqual(saved);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cvs/cv-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ version: 7, patch: { contact: { links: [], email: 'a@b.co' } } });
  });

  it('turns a 409 VERSION_CONFLICT envelope into an ApiError with that code and message, after exactly one request', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(409, { error: { code: 'VERSION_CONFLICT', message: 'Stale version: reload the CV.' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const e = (await apiFetch('/cvs/cv-1', { method: 'PATCH', body: { version: 7, patch: {} } }).catch(
      (x: unknown) => x,
    )) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(409);
    expect(e.code).toBe('VERSION_CONFLICT');
    expect(e.message).toBe('Stale version: reload the CV.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('envelope codes (ADR-018, C-000)', () => {
  it('ERROR_CODES lists both provider failures', async () => {
    const { ERROR_CODES } = await import('./client');
    expect(ERROR_CODES).toContain('LLM_AUTH_FAILED');
    expect(ERROR_CODES).toContain('LLM_INVALID_REQUEST');
  });

  it('keeps the code and message of an unknown code instead of downgrading to INTERNAL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { error: { code: 'SOMETHING_NEW', message: 'Said by the server.' } })),
    );
    const err = (await apiFetch('/x').catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('SOMETHING_NEW');
    expect(err.message).toBe('Said by the server.');
  });

  it('still downgrades a body that is not an envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(500, { error: { code: 'X' } })));
    const err = (await apiFetch('/x').catch((e) => e)) as ApiError;
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('Something went wrong. Please try again.');
  });
});
