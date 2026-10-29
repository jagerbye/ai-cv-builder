import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

// C-000 error envelope. Every non-2xx body is exactly:
//   { error: { code, message, details? } }
// `code` comes from the closed enum below. `message` is always a fixed, human-safe
// string written here, never a driver, parser or stack message. Nothing from the
// thrown error (message, stack, connection target, request body) is copied into
// the response. Server-side detail goes to the log as class and code only.

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

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetail {
  path: string;
  message: string;
}

export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; details?: ErrorDetail[] };
}

// Thrown by route code to answer with a specific status, code and safe message.
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;

  constructor(status: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION: 'The request is not valid.',
  UNAUTHENTICATED: 'Sign in is required.',
  NOT_FOUND: 'Not found.',
  CONFLICT: 'The request conflicts with existing data.',
  VERSION_CONFLICT: 'The item was changed by someone else. Reload and try again.',
  PAYLOAD_TOO_LARGE: 'The request body is too large.',
  UNSUPPORTED_SOURCE: 'This source type is not supported.',
  RATE_LIMITED: 'Too many requests. Try again later.',
  LLM_UNAVAILABLE: 'The generation service is unavailable. Try again later.',
  LLM_INVALID_OUTPUT: 'The generation service returned an unusable result.',
  LLM_AUTH_FAILED: 'The generation service rejected the configured API key.',
  LLM_INVALID_REQUEST: 'The generation service rejected the request.',
  LLM_BUDGET_EXCEEDED: 'The generation used more of its allowance than a single CV may take, so it was stopped.',
  JOB_TIMEOUT: 'The job took too long and was stopped.',
  CONFIG_MISSING: 'The server is not configured for this request.',
  INTERNAL: 'Something went wrong on our side.',
};

// ADR-017: the one fixed, safe message that belongs to a code. Never a thrown error's own text.
export function safeMessage(code: ErrorCode): string {
  return DEFAULT_MESSAGE[code];
}

export function envelope(code: ErrorCode, message?: string, details?: ErrorDetail[]): ErrorEnvelope {
  const body: ErrorEnvelope = { error: { code, message: message ?? DEFAULT_MESSAGE[code] } };
  if (details && details.length > 0) body.error.details = details;
  return body;
}

// Maps any thrown value to a status and envelope. Unknown errors become 500 INTERNAL.
// Matched by shape too: the same class can load twice (module reset, duplicate graph),
// and an instanceof miss would turn a deliberate 401 or 404 into a 500.
function isApiErrorLike(err: unknown): err is ApiError {
  const e = err as { name?: unknown; status?: unknown; code?: unknown };
  return (
    err instanceof ApiError ||
    (e?.name === 'ApiError' && typeof e.status === 'number' && ERROR_CODES.includes(e.code as ErrorCode))
  );
}

export function toErrorResponse(err: unknown): { status: number; body: ErrorEnvelope } {
  if (isApiErrorLike(err)) {
    return { status: err.status, body: envelope(err.code, err.message, err.details) };
  }
  const e = err as { statusCode?: unknown; code?: unknown; validation?: unknown; validationContext?: unknown };
  const status = typeof e?.statusCode === 'number' ? e.statusCode : 500;
  const code = typeof e?.code === 'string' ? e.code : '';

  if (Array.isArray(e?.validation)) {
    const details = (e.validation as Array<{ instancePath?: string; params?: { missingProperty?: string }; message?: string }>).map(
      (v) => {
        const path = v.params?.missingProperty ?? (v.instancePath ?? '').replace(/^\//, '').replace(/\//g, '.');
        return { path, message: v.message ?? 'is invalid' };
      },
    );
    return { status: 400, body: envelope('VALIDATION', undefined, details) };
  }
  if (code.startsWith('FST_ERR_CTP_INVALID') || code === 'FST_ERR_CTP_EMPTY_JSON_BODY') {
    return { status: 400, body: envelope('VALIDATION', 'The request body is not valid JSON.') };
  }
  if (code === 'FST_ERR_CTP_BODY_TOO_LARGE' || status === 413) {
    return { status: 413, body: envelope('PAYLOAD_TOO_LARGE') };
  }
  if (status === 404) return { status: 404, body: envelope('NOT_FOUND') };
  if (status === 401) return { status: 401, body: envelope('UNAUTHENTICATED') };
  if (status === 429) return { status: 429, body: envelope('RATE_LIMITED') };
  if (status >= 400 && status < 500) return { status: 400, body: envelope('VALIDATION') };
  return { status: 500, body: envelope('INTERNAL') };
}

// Logs class and code only. Driver and parser messages can echo a connection
// target or request content, so they never go to the log either.
function logFailure(request: FastifyRequest, err: unknown, status: number): void {
  const e = err as { name?: string; code?: string };
  request.log.warn(
    { status, errorName: e?.name, errorCode: e?.code, reqId: request.id },
    'request failed',
  );
}

// Installs the envelope on this Fastify context and its children. It covers
// unmatched paths under the context and any thrown error inside it.
export function installErrorEnvelope(app: FastifyInstance): void {
  app.setErrorHandler((err, request, reply: FastifyReply) => {
    const { status, body } = toErrorResponse(err);
    logFailure(request, err, status);
    return reply.code(status).send(body);
  });
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(envelope('NOT_FOUND'));
  });
}
