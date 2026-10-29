// T-09 (CVB-9), C-012 / ADR-006 / F-010. LLM settings read from the environment.
// Pure: takes the env object as an argument, so tests never touch process.env.
// The API key is optional here on purpose: the app boots without it, and the
// gateway fails generation with CONFIG_MISSING instead (F-010).

// Default model id. Overridden by ANTHROPIC_MODEL; no call site names a model.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';

// ADR-021: two numbers. The output cap bounds ONE response (max_tokens), sized so a full CV fits.
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;

// The spend budget is per JOB (F-010): input + output across extract, compose and any schema retry.
export const DEFAULT_TOKEN_BUDGET_PER_JOB = 500_000;

// Wall-clock limit for one provider request attempt.
export const DEFAULT_TIMEOUT_MS = 60_000;

// ADR-029: the retry policy for a transient provider failure (429, 5xx, transport). Backoff doubles from
// the base, with jitter, and the retries of one provider request share a waiting budget: nothing is
// scheduled past it. Defaults: 2 s base (waits of ~2, 4, 8 s) and a 20 s budget, far inside C-005's 180 s.
export const DEFAULT_RETRY_BASE_SECONDS = 2;
export const DEFAULT_RETRY_BUDGET_SECONDS = 20;

export interface LlmConfig {
  apiKey?: string;
  // Endpoint of an Anthropic-compatible proxy; undefined means the SDK default (the Anthropic API).
  baseUrl?: string;
  model: string;
  maxOutputTokens: number;
  tokenBudgetPerJob: number;
  timeoutMs: number;
  retryBaseMs: number;
  retryBudgetMs: number;
}

// The slice of Env this module reads. The parsed Env from env.ts satisfies it.
export interface LlmEnv {
  ANTHROPIC_API_KEY?: string | undefined;
  ANTHROPIC_MODEL?: string | undefined;
  ANTHROPIC_BASE_URL?: string | undefined;
  ANTHROPIC_MAX_OUTPUT_TOKENS?: string | undefined;
  ANTHROPIC_TOKEN_BUDGET_PER_JOB?: string | undefined;
  ANTHROPIC_RETRY_BASE_SECONDS?: string | undefined;
  ANTHROPIC_RETRY_BUDGET_SECONDS?: string | undefined;
}

// Names the variable only, never its value. Unset or empty means the default.
function positiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.length === 0) return fallback;
  if (!/^[0-9]+$/.test(value) || Number(value) < 1 || !Number.isSafeInteger(Number(value))) {
    throw new Error(`Invalid environment: ${name} must be a positive whole number`);
  }
  return Number(value);
}

export function readLlmConfig(env: LlmEnv): LlmConfig {
  const key = env.ANTHROPIC_API_KEY;
  const model = env.ANTHROPIC_MODEL;
  const baseUrl = env.ANTHROPIC_BASE_URL;
  return {
    apiKey: key && key.length > 0 ? key : undefined,
    baseUrl: baseUrl && baseUrl.length > 0 ? baseUrl : undefined,
    model: model && model.length > 0 ? model : DEFAULT_ANTHROPIC_MODEL,
    maxOutputTokens: positiveInt('ANTHROPIC_MAX_OUTPUT_TOKENS', env.ANTHROPIC_MAX_OUTPUT_TOKENS, DEFAULT_MAX_OUTPUT_TOKENS),
    tokenBudgetPerJob: positiveInt('ANTHROPIC_TOKEN_BUDGET_PER_JOB', env.ANTHROPIC_TOKEN_BUDGET_PER_JOB, DEFAULT_TOKEN_BUDGET_PER_JOB),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryBaseMs: positiveInt('ANTHROPIC_RETRY_BASE_SECONDS', env.ANTHROPIC_RETRY_BASE_SECONDS, DEFAULT_RETRY_BASE_SECONDS) * 1000,
    retryBudgetMs: positiveInt('ANTHROPIC_RETRY_BUDGET_SECONDS', env.ANTHROPIC_RETRY_BUDGET_SECONDS, DEFAULT_RETRY_BUDGET_SECONDS) * 1000,
  };
}
