import { describe, it, expect } from 'vitest';
import { readLlmConfig } from './config.js';

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
