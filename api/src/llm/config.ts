// T-09 (CVB-9), C-012 / ADR-006 / F-010. LLM settings read from the environment.
// Pure: takes the env object as an argument, so tests never touch process.env.
// The API key is optional here on purpose: the app boots without it, and the
// gateway fails generation with CONFIG_MISSING instead (F-010).

// Default model id. Overridden by ANTHROPIC_MODEL; no call site names a model.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';

// Per-call token budget: caps max_tokens and bounds the reported usage (ADR-006).
export const DEFAULT_TOKEN_BUDGET_PER_CALL = 4096;

// Wall-clock limit for one provider request attempt.
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface LlmConfig {
  apiKey?: string;
  model: string;
  tokenBudgetPerCall: number;
  timeoutMs: number;
}

export function readLlmConfig(env: Readonly<Record<string, string | undefined>>): LlmConfig {
  const key = env.ANTHROPIC_API_KEY;
  const model = env.ANTHROPIC_MODEL;
  return {
    apiKey: key && key.length > 0 ? key : undefined,
    model: model && model.length > 0 ? model : DEFAULT_ANTHROPIC_MODEL,
    tokenBudgetPerCall: DEFAULT_TOKEN_BUDGET_PER_CALL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}
