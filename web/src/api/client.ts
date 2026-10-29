// Typed client for the C-000 error envelope: { error: { code, message, details? } }.
// Every non-2xx response becomes an ApiError. A body that is not that envelope
// (HTML, plain text, a provider payload) is never shown to the user: it maps to
// code INTERNAL with a generic message.

export const ERROR_CODES = [
  'VALIDATION',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'CONFLICT',
  'VERSION_CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_SOURCE',
  'RATE_LIMITED',
  'LLM_UNAVAILABLE',
  'LLM_INVALID_OUTPUT',
  'LLM_AUTH_FAILED',
  'LLM_INVALID_REQUEST',
  'LLM_BUDGET_EXCEEDED',
  'JOB_TIMEOUT',
  'CONFIG_MISSING',
  'INTERNAL',
] as const;

export type KnownErrorCode = (typeof ERROR_CODES)[number];
// The enum is closed on the server but open for a client (C-000, ADR-018): a code
// added later still arrives with its own message, which is shown as it is. The
// list above is only for autocomplete and for code that special-cases a code;
// nothing is rejected for being absent from it. api/src/http/errors.ts is the
// source, and error-codes-sync.test.ts fails when the two lists drift.
export type ErrorCode = KnownErrorCode | (string & {});

export interface ErrorDetail {
  path: string;
  message: string;
}

export const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];

  constructor(status: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

function parseDetails(value: unknown): ErrorDetail[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ErrorDetail[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as ErrorDetail).path === 'string' &&
      typeof (item as ErrorDetail).message === 'string'
    ) {
      out.push({ path: (item as ErrorDetail).path, message: (item as ErrorDetail).message });
    }
  }
  return out;
}

// Shared by every request that reads a C-000 envelope, JSON or multipart.
export async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return new ApiError(res.status, 'INTERNAL', GENERIC_MESSAGE);
  }
  const error = (body as { error?: unknown } | null)?.error as
    | { code?: unknown; message?: unknown; details?: unknown }
    | undefined;
  if (!error || typeof error.code !== 'string' || error.code === '' || typeof error.message !== 'string') {
    return new ApiError(res.status, 'INTERNAL', GENERIC_MESSAGE);
  }
  return new ApiError(res.status, error.code, error.message, parseDetails(error.details));
}

export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers();
  let body: string | undefined;
  if (init.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.body);
  }
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body,
    credentials: 'same-origin',
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
