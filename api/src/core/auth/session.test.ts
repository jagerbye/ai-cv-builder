import { describe, it, expect } from 'vitest';
import { ApiError } from '../../http/errors.js';
import { hashToken, newSessionToken } from './session.js';
import { assertOwnership } from './ownership.js';

// T-04 (CVB-4). Unit tests for ADR-007 and C-002 building blocks:
//  - session.ts: the stored value is sha256 of the opaque cookie token, never the token.
//  - ownership.ts: assertOwnership throws NotFound (404), never Forbidden (403),
//    for another user's entity and for a missing entity (F-001, C-000 rule).

describe('ADR-007 session token storage', () => {
  it('hashToken is the lowercase hex sha256 of the raw token (known vectors)', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashToken('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashToken never returns the raw token and differs for distinct tokens', () => {
    const a = hashToken('token-one-aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const b = hashToken('token-two-bbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe('token-one-aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(a).not.toBe(b);
  });

  it('newSessionToken is opaque base64url with at least 256 bits of entropy, and unique per call', () => {
    const t1 = newSessionToken();
    const t2 = newSessionToken();
    expect(t1).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(t1, 'base64url').length).toBeGreaterThanOrEqual(32);
    expect(t1).not.toBe(t2);
  });

  it('negative: a stored hash is not usable as the cookie value (hash of hash differs)', () => {
    const token = newSessionToken();
    expect(hashToken(hashToken(token))).not.toBe(hashToken(token));
  });
});

describe('C-002 / ADR-007 assertOwnership: another user\'s entity is NotFound, never Forbidden', () => {
  const USER_A = '11111111-1111-4111-8111-111111111111';
  const USER_B = '22222222-2222-4222-8222-222222222222';
  const USER_C = '33333333-3333-4333-8333-333333333333';

  it('returns without throwing when the entity belongs to the caller (three distinct owners)', () => {
    expect(() => assertOwnership(USER_A, { userId: USER_A })).not.toThrow();
    expect(() => assertOwnership(USER_B, { userId: USER_B })).not.toThrow();
    expect(() => assertOwnership(USER_C, { userId: USER_C })).not.toThrow();
  });

  it('user A requesting user B\'s entity throws ApiError with status 404 and code NOT_FOUND', () => {
    let caught: unknown;
    try {
      assertOwnership(USER_A, { userId: USER_B });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(404);
    expect((caught as ApiError).code).toBe('NOT_FOUND');
  });

  it('the same guard holds for each distinct foreign pair (no hard-coded status)', () => {
    for (const [caller, owner] of [[USER_B, USER_A], [USER_C, USER_A], [USER_A, USER_C]]) {
      expect(() => assertOwnership(caller, { userId: owner })).toThrow(ApiError);
      try {
        assertOwnership(caller, { userId: owner });
      } catch (err) {
        expect((err as ApiError).status).toBe(404);
        expect((err as ApiError).code).toBe('NOT_FOUND');
      }
    }
  });

  it('a missing entity (null or undefined) is also 404 NOT_FOUND', () => {
    for (const missing of [null, undefined]) {
      try {
        assertOwnership(USER_A, missing as unknown as { userId: string });
        expect.unreachable('assertOwnership must throw for a missing entity');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(404);
        expect((err as ApiError).code).toBe('NOT_FOUND');
      }
    }
  });

  it('the NotFound message does not echo either user id', () => {
    try {
      assertOwnership(USER_A, { userId: USER_B });
      expect.unreachable('assertOwnership must throw for a foreign entity');
    } catch (err) {
      const msg = (err as ApiError).message;
      expect(msg).not.toContain(USER_A);
      expect(msg).not.toContain(USER_B);
    }
  });
});
