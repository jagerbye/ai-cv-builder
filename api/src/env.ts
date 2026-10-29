// Environment, parsed once at module load (boot). Malformed config fails here,
// loudly and early. Error messages never echo a value: DATABASE_URL carries
// credentials, so only the variable name is reported.

export interface Env {
  DATABASE_URL: string;
  // Optional by design (spec.md F-010): the app boots without it and generation
  // fails later with a configuration error.
  ANTHROPIC_API_KEY: string | undefined;
  // Optional: model id override. Empty or absent means the default in llm/config.ts.
  ANTHROPIC_MODEL: string | undefined;
  // Optional: endpoint of an Anthropic-compatible proxy. Absent means the Anthropic API itself.
  ANTHROPIC_BASE_URL: string | undefined;
  // Optional (ADR-021): output cap per response and token budget per job. Validated in llm/config.ts.
  ANTHROPIC_MAX_OUTPUT_TOKENS: string | undefined;
  ANTHROPIC_TOKEN_BUDGET_PER_JOB: string | undefined;
  // Optional (ADR-029): retry base and waiting budget, in seconds. Validated in llm/config.ts.
  ANTHROPIC_RETRY_BASE_SECONDS: string | undefined;
  ANTHROPIC_RETRY_BUDGET_SECONDS: string | undefined;
}

function optional(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

// Reports only the variable name: the URL may carry credentials.
function parseBaseUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid environment: ANTHROPIC_BASE_URL is not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid environment: ANTHROPIC_BASE_URL must use the http:// or https:// scheme');
  }
  return value;
}

function parseEnv(source: NodeJS.ProcessEnv): Env {
  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Invalid environment: DATABASE_URL is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('Invalid environment: DATABASE_URL is not a valid URL');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('Invalid environment: DATABASE_URL must use the postgresql:// scheme');
  }
  if (!parsed.hostname) {
    throw new Error('Invalid environment: DATABASE_URL has no host');
  }

  const key = source.ANTHROPIC_API_KEY;
  return {
    DATABASE_URL: databaseUrl,
    ANTHROPIC_API_KEY: key && key.length > 0 ? key : undefined,
    ANTHROPIC_MODEL: optional(source.ANTHROPIC_MODEL),
    ANTHROPIC_BASE_URL: parseBaseUrl(optional(source.ANTHROPIC_BASE_URL)),
    ANTHROPIC_MAX_OUTPUT_TOKENS: optional(source.ANTHROPIC_MAX_OUTPUT_TOKENS),
    ANTHROPIC_TOKEN_BUDGET_PER_JOB: optional(source.ANTHROPIC_TOKEN_BUDGET_PER_JOB),
    ANTHROPIC_RETRY_BASE_SECONDS: optional(source.ANTHROPIC_RETRY_BASE_SECONDS),
    ANTHROPIC_RETRY_BUDGET_SECONDS: optional(source.ANTHROPIC_RETRY_BUDGET_SECONDS),
  };
}

export const env: Env = parseEnv(process.env);
