import { describe, it, expect, afterEach, vi } from 'vitest';

// ADR-021. env.ts carries the two new variables through to llm/config.ts: unset or empty is undefined (the
// default applies there), a value is passed through verbatim. Validation of the value is llm/config.ts's job.

const NAMES = ['DATABASE_URL', 'ANTHROPIC_MAX_OUTPUT_TOKENS', 'ANTHROPIC_TOKEN_BUDGET_PER_JOB'] as const;
const ORIGINAL = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));

afterEach(() => {
  for (const n of NAMES) {
    if (ORIGINAL[n] === undefined) delete process.env[n];
    else process.env[n] = ORIGINAL[n];
  }
});

async function importEnv(vars: Partial<Record<(typeof NAMES)[number], string>>) {
  vi.resetModules();
  process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/app';
  delete process.env.ANTHROPIC_MAX_OUTPUT_TOKENS;
  delete process.env.ANTHROPIC_TOKEN_BUDGET_PER_JOB;
  Object.assign(process.env, vars);
  return import('../env');
}

describe('env: ANTHROPIC_MAX_OUTPUT_TOKENS and ANTHROPIC_TOKEN_BUDGET_PER_JOB', () => {
  it('are optional: absent gives undefined', async () => {
    const { env } = await importEnv({});
    expect(env.ANTHROPIC_MAX_OUTPUT_TOKENS).toBeUndefined();
    expect(env.ANTHROPIC_TOKEN_BUDGET_PER_JOB).toBeUndefined();
  });

  it('treat an empty value as absent', async () => {
    const { env } = await importEnv({ ANTHROPIC_MAX_OUTPUT_TOKENS: '', ANTHROPIC_TOKEN_BUDGET_PER_JOB: '' });
    expect(env.ANTHROPIC_MAX_OUTPUT_TOKENS).toBeUndefined();
    expect(env.ANTHROPIC_TOKEN_BUDGET_PER_JOB).toBeUndefined();
  });

  it('expose each value under its own name, so the two numbers cannot be swapped', async () => {
    const { env } = await importEnv({ ANTHROPIC_MAX_OUTPUT_TOKENS: '12345', ANTHROPIC_TOKEN_BUDGET_PER_JOB: '67890' });
    expect(env.ANTHROPIC_MAX_OUTPUT_TOKENS).toBe('12345');
    expect(env.ANTHROPIC_TOKEN_BUDGET_PER_JOB).toBe('67890');
  });
});
