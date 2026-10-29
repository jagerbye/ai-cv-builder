import { describe, it, expect } from 'vitest';
import { ApiError, ERROR_CODES, envelope, safeMessage, toErrorResponse } from './errors.js';
import { GATEWAY_ERROR_CODES, GatewayError } from '../core/generation/gateway.js';

// ADR-018: the gateway's codes are drawn from the C-000 enum, and each has its own fixed safe message.
describe('ADR-018 error codes', () => {
  it('every code the gateway can throw is in the C-000 enum', () => {
    for (const code of GATEWAY_ERROR_CODES) expect(ERROR_CODES).toContain(code);
  });

  it('LLM_AUTH_FAILED and LLM_INVALID_REQUEST are enum members with distinct fixed messages', () => {
    expect(safeMessage('LLM_AUTH_FAILED')).toBe('The generation service rejected the configured API key.');
    expect(safeMessage('LLM_INVALID_REQUEST')).toBe('The generation service rejected the request.');
    expect(safeMessage('LLM_AUTH_FAILED')).not.toBe(safeMessage('INTERNAL'));
    expect(safeMessage('LLM_INVALID_REQUEST')).not.toBe(safeMessage('INTERNAL'));
  });

  it('a GatewayError carries the same message the envelope would, never provider text', () => {
    for (const code of GATEWAY_ERROR_CODES) expect(new GatewayError(code).message).toBe(safeMessage(code));
  });

  it('the HTTP envelope carries the new codes with their fixed messages', () => {
    for (const code of ['LLM_AUTH_FAILED', 'LLM_INVALID_REQUEST'] as const) {
      expect(envelope(code)).toEqual({ error: { code, message: safeMessage(code) } });
      const { status, body } = toErrorResponse(new ApiError(502, code, safeMessage(code)));
      expect(status).toBe(502);
      expect(body.error.code).toBe(code);
    }
  });
});
