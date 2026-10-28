import { describe, it, expect, afterEach, vi } from 'vitest';

// B-002 / F-010: a malformed DATABASE_URL fails loudly at import (boot), the
// message names the variable and never echoes the value (it carries credentials).

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

async function importEnv(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = value;
  return import('../env');
}

describe('env: DATABASE_URL validation', () => {
  const bad: Array<[string, string | undefined, string?]> = [
    ['missing', undefined],
    ['empty', ''],
    ['not a URL', 'not-a-url-s3cret'],
    ['mysql scheme', 'mysql://user:s3cretpw@db.example:3306/app', 's3cretpw'],
    ['host-less', 'postgresql:///app?user=u&password=s3cretpw', 's3cretpw'],
  ];

  for (const [label, value, secret] of bad) {
    it(`throws at import when DATABASE_URL is ${label}`, async () => {
      let message = '';
      try {
        await importEnv(value);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/DATABASE_URL/);
      if (value) expect(message).not.toContain(value);
      if (secret) expect(message).not.toContain(secret);
      expect(message).not.toContain('s3cret');
    });
  }

  it('accepts a postgresql:// URL and allows ANTHROPIC_API_KEY to be absent (F-010)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { env } = await importEnv('postgresql://u:p@localhost:5432/app');
    expect(env.DATABASE_URL).toBe('postgresql://u:p@localhost:5432/app');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
