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
  'JOB_TIMEOUT',
  'CONFIG_MISSING',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

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

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
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

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return new ApiError(res.status, 'INTERNAL', GENERIC_MESSAGE);
  }
  const error = (body as { error?: unknown } | null)?.error as
    | { code?: unknown; message?: unknown; details?: unknown }
    | undefined;
  if (!error || !isErrorCode(error.code) || typeof error.message !== 'string') {
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
