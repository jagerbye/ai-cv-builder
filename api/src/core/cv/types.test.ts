import { describe, it, expect, expectTypeOf } from 'vitest';
import type { CvPatch, CvPatchRequest, CvResponse } from './types.js';

// T-07 (CVB-24). C-006 response DTO and C-008 patch shape, declaration-only.
// Types are erased at runtime; the type criteria are proven by `tsc`.

describe('C-006 CvResponse (types only)', () => {
  it('state is exactly generating | ready | failed', () => {
    expectTypeOf<CvResponse['state']>().toEqualTypeOf<'generating' | 'ready' | 'failed'>();
  });

  it('questions carry open | answered | dismissed status', () => {
    expectTypeOf<CvResponse['questions'][number]['status']>().toEqualTypeOf<
      'open' | 'answered' | 'dismissed'
    >();
  });

  it('facts carry source document | user and a verbatim sourceQuote', () => {
    expectTypeOf<CvResponse['facts'][number]['source']>().toEqualTypeOf<'document' | 'user'>();
    expectTypeOf<CvResponse['facts'][number]['sourceQuote']>().toEqualTypeOf<string>();
  });

  it('every experience bullet cites factIds and carries userEdited', () => {
    expectTypeOf<CvResponse['experience'][number]['bullets'][number]['factIds']>().toEqualTypeOf<
      string[]
    >();
    expectTypeOf<CvResponse['experience'][number]['bullets'][number]['userEdited']>().toEqualTypeOf<
      boolean
    >();
  });

  it('carries version as a number and the three ordered collections', () => {
    expectTypeOf<CvResponse['version']>().toEqualTypeOf<number>();
    expectTypeOf<CvResponse['experience'][number]['order']>().toEqualTypeOf<number>();
    expectTypeOf<CvResponse['education'][number]['order']>().toEqualTypeOf<number>();
  });
});

describe('C-008 CvPatchRequest (types only)', () => {
  it('is { version: number, patch: { contact?, summary?, experience?, education?, skills? } }', () => {
    expectTypeOf<CvPatchRequest['version']>().toEqualTypeOf<number>();
    expectTypeOf<CvPatchRequest['patch']>().toEqualTypeOf<CvPatch>();
    expectTypeOf<keyof CvPatch>().toEqualTypeOf<
      'contact' | 'summary' | 'experience' | 'education' | 'skills'
    >();
  });

  it('cannot patch state, title, questions or facts', () => {
    const neverCalled = (): CvPatchRequest => ({
      version: 1,
      // @ts-expect-error state is server-owned and not patchable (C-008)
      patch: { state: 'ready' },
    });
    expect(typeof neverCalled).toBe('function');
  });
});
