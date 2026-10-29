import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  AnthropicGateway,
  CvDraft,
  Fact,
  GenerationPipeline,
  QuestionDraft,
  VerificationResult,
} from './types.js';
import type { TokenLedger } from './ledger.js';

// T-07 (CVB-24). C-012 interfaces, declaration-only. Types are erased at
// runtime, so the type criteria are proven by `tsc` (the typecheck gate), and
// the runtime assertions below only pin the value-level contract of the module.
// ADR-002, structural half: compose() takes facts and a target role, never the
// raw source text.

describe('C-012 GenerationPipeline (types only)', () => {
  it('extract takes the raw source text and returns facts', () => {
    expectTypeOf<GenerationPipeline['extract']>().parameters.toEqualTypeOf<[sourceText: string, ledger?: TokenLedger | undefined]>();
    expectTypeOf<GenerationPipeline['extract']>().returns.toEqualTypeOf<Promise<Fact[]>>();
  });

  it('compose takes facts, a target role and an optional ledger, and returns a CvDraft', () => {
    expectTypeOf<GenerationPipeline['compose']>().parameters.toEqualTypeOf<
      [facts: Fact[], targetRole: string, ledger?: TokenLedger | undefined]
    >();
    expectTypeOf<GenerationPipeline['compose']>().returns.toEqualTypeOf<Promise<CvDraft>>();
  });

  it('compose rejects the raw source text at compile time (ADR-002)', () => {
    const neverCalled = (pipeline: GenerationPipeline): void => {
      // @ts-expect-error compose never receives sourceText; passing it must not compile
      pipeline.compose([], 'Backend engineer', 'raw source text');
    };
    expect(typeof neverCalled).toBe('function');
  });

  it('verify is synchronous over (draft, facts) and returns a VerificationResult', () => {
    expectTypeOf<GenerationPipeline['verify']>().parameters.toEqualTypeOf<
      [draft: CvDraft, facts: Fact[]]
    >();
    expectTypeOf<GenerationPipeline['verify']>().returns.toEqualTypeOf<VerificationResult>();
  });

  it('CvDraft experience and education entries each carry factIds (ADR-013)', () => {
    expectTypeOf<CvDraft['experience'][number]['factIds']>().toEqualTypeOf<string[]>();
    expectTypeOf<CvDraft['education'][number]['factIds']>().toEqualTypeOf<string[]>();
  });

  it('VerificationResult carries accepted draft, question drafts and dropped items', () => {
    expectTypeOf<VerificationResult['accepted']>().toEqualTypeOf<CvDraft>();
    expectTypeOf<VerificationResult['questions']>().toEqualTypeOf<QuestionDraft[]>();
    expectTypeOf<VerificationResult>().toHaveProperty('dropped');
  });
});

describe('C-012 AnthropicGateway (types only)', () => {
  it('is the only surface the SDK sits behind: callTool, nothing else', () => {
    expectTypeOf<keyof AnthropicGateway>().toEqualTypeOf<'callTool'>();
  });
});
