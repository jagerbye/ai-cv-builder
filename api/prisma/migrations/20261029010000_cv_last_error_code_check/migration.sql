-- CHECK constraint (ADR-017, ADR-018): last_error_code is a closed set, the C-000 error enum. NULL passes
-- (a CV that has not failed). Hand-written, like the other CHECKs: Prisma cannot express it.
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_last_error_code_check" CHECK ("last_error_code" IN (
  'VALIDATION', 'UNAUTHENTICATED', 'NOT_FOUND', 'CONFLICT', 'VERSION_CONFLICT', 'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_SOURCE', 'RATE_LIMITED', 'LLM_UNAVAILABLE', 'LLM_INVALID_OUTPUT', 'LLM_AUTH_FAILED',
  'LLM_INVALID_REQUEST', 'JOB_TIMEOUT', 'CONFIG_MISSING', 'INTERNAL'
));
