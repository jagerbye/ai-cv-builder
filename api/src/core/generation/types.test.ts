import { describe, it, expect, expectTypeOf } from 'vitest';
import type {
  AnthropicGateway,
  CvDraft,
  Fact,
  GenerationPipeline,
  QuestionDraft,
  VerificationResult,
} from './types.js';

// T-07 (CVB-24). C-012 interfaces, declaration-only. Types are erased at
// runtime, so the type criteria are proven by `tsc` (the typecheck gate), and
// the runtime assertions below only pin the value-level contract of the module.
// ADR-002, structural half: compose() takes facts and a target role, never the
// raw source text.

describe('C-012 GenerationPipeline (types only)', () => {
  it('extract takes the raw source text and returns facts', () => {
    expectTypeOf<GenerationPipeline['extract']>().parameters.toEqualTypeOf<[sourceText: string]>();
    expectTypeOf<GenerationPipeline['extract']>().returns.toEqualTypeOf<Promise<Fact[]>>();
  });

  it('compose takes exactly facts and a target role and returns a CvDraft', () => {
    expectTypeOf<GenerationPipeline['compose']>().parameters.toEqualTypeOf<
      [facts: Fact[], targetRole: string]
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
