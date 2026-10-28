// Environment, parsed once at module load (boot). Malformed config fails here,
// loudly and early. Error messages never echo a value: DATABASE_URL carries
// credentials, so only the variable name is reported.

export interface Env {
  DATABASE_URL: string;
  // Optional by design (spec.md F-010): the app boots without it and generation
  // fails later with a configuration error.
  ANTHROPIC_API_KEY: string | undefined;
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
  };
}

export const env: Env = parseEnv(process.env);
