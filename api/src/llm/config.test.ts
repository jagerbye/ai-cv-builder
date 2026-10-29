import { describe, it, expect } from 'vitest';
import { readLlmConfig, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TOKEN_BUDGET_PER_JOB } from './config.js';

// T-09 (CVB-9), C-012 / F-010. Model id comes from configuration, never a code
// literal; the API key is optional at boot (F-010: app starts without it).

describe('readLlmConfig', () => {
  it('defaults the model to a Sonnet id when ANTHROPIC_MODEL is unset', () => {
    const cfg = readLlmConfig({});
    expect(cfg.model).toMatch(/sonnet/i);
  });

  it('takes the model from ANTHROPIC_MODEL when it is set', () => {
    expect(readLlmConfig({ ANTHROPIC_MODEL: 'model-alpha-test' }).model).toBe('model-alpha-test');
    expect(readLlmConfig({ ANTHROPIC_MODEL: 'model-beta-test' }).model).toBe('model-beta-test');
  });

  it('returns the API key it was given, unchanged', () => {
    expect(readLlmConfig({ ANTHROPIC_API_KEY: 'sk-ant-config-KEY-1' }).apiKey).toBe('sk-ant-config-KEY-1');
  });

  it('does not throw without ANTHROPIC_API_KEY and reports it as absent', () => {
    expect(() => readLlmConfig({})).not.toThrow();
    expect(readLlmConfig({}).apiKey).toBeUndefined();
  });

  it('passes ANTHROPIC_BASE_URL through as baseUrl and reports it absent when unset or empty', () => {
    expect(readLlmConfig({ ANTHROPIC_BASE_URL: 'https://proxy.example.test/api' }).baseUrl).toBe('https://proxy.example.test/api');
    expect(readLlmConfig({}).baseUrl).toBeUndefined();
    expect(readLlmConfig({ ANTHROPIC_BASE_URL: '' }).baseUrl).toBeUndefined();
  });
});

// ADR-021. The output cap (max_tokens) and the spend budget (per job) are two numbers, each from its own setting.
describe('readLlmConfig: output cap and per-job budget (ADR-021)', () => {
  it('has no per-call budget left: the old single number is gone', () => {
    expect(readLlmConfig({})).not.toHaveProperty('tokenBudgetPerCall');
  });

  it('defaults the output cap to a size a full CV fits in', () => {
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(32000);
    expect(readLlmConfig({}).maxOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });

  it('takes the output cap from ANTHROPIC_MAX_OUTPUT_TOKENS', () => {
    expect(readLlmConfig({ ANTHROPIC_MAX_OUTPUT_TOKENS: '12345' }).maxOutputTokens).toBe(12345);
  });

  it('rejects an output cap that is not a positive whole number, at read time', () => {
    expect(() => readLlmConfig({ ANTHROPIC_MAX_OUTPUT_TOKENS: 'lots' })).toThrow();
    expect(() => readLlmConfig({ ANTHROPIC_MAX_OUTPUT_TOKENS: '0' })).toThrow();
  });

  it('defaults the per-job budget and takes it from ANTHROPIC_TOKEN_BUDGET_PER_JOB', () => {
    expect(readLlmConfig({}).tokenBudgetPerJob).toBe(DEFAULT_TOKEN_BUDGET_PER_JOB);
    expect(readLlmConfig({ ANTHROPIC_TOKEN_BUDGET_PER_JOB: '250000' }).tokenBudgetPerJob).toBe(250000);
  });

  it('keeps the per-job budget at least one full output, so one call can always complete', () => {
    const cfg = readLlmConfig({});
    expect(cfg.tokenBudgetPerJob).toBeGreaterThanOrEqual(cfg.maxOutputTokens);
  });

  // Both settings reject a bad value at read time, naming the variable and never the value.
  const bad = ['lots', '0', '-5', '1.5', '12abc', '1e3', ' 7', '99999999999999999999'];
  for (const [name, key] of [['output cap', 'ANTHROPIC_MAX_OUTPUT_TOKENS'], ['per-job budget', 'ANTHROPIC_TOKEN_BUDGET_PER_JOB']] as const) {
    for (const value of bad) {
      it(`rejects ${JSON.stringify(value)} as the ${name}, naming ${key} and not echoing the value`, () => {
        let message = '';
        try {
          readLlmConfig({ [key]: value });
        } catch (err) {
          message = (err as Error).message;
        }
        expect(message).toContain(key);
        expect(message).toContain('positive whole number');
        if (value.trim().length > 0) expect(message).not.toContain(value);
      });
    }
    it(`treats an empty ${name} as unset, not as a bad value`, () => {
      expect(() => readLlmConfig({ [key]: '' })).not.toThrow();
    });
  }
});
