import { describe, it, expect, afterEach, vi } from 'vitest';

// B-002 / F-010: a malformed DATABASE_URL fails loudly at import (boot), the
// message names the variable and never echoes the value (it carries credentials).

const ORIGINAL_DB_URL = process.env.DATABASE_URL;
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_BASE = process.env.ANTHROPIC_BASE_URL;
const ORIGINAL_MODEL = process.env.ANTHROPIC_MODEL;

afterEach(() => {
  if (ORIGINAL_DB_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DB_URL;
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_BASE === undefined) delete process.env.ANTHROPIC_BASE_URL;
  else process.env.ANTHROPIC_BASE_URL = ORIGINAL_BASE;
  if (ORIGINAL_MODEL === undefined) delete process.env.ANTHROPIC_MODEL;
  else process.env.ANTHROPIC_MODEL = ORIGINAL_MODEL;
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

describe('env: ANTHROPIC_BASE_URL and ANTHROPIC_MODEL', () => {
  const DB = 'postgresql://u:p@localhost:5432/app';

  it('treats both as optional: absent or empty gives undefined', async () => {
    delete process.env.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_MODEL = '';
    const { env } = await importEnv(DB);
    expect(env.ANTHROPIC_BASE_URL).toBeUndefined();
    expect(env.ANTHROPIC_MODEL).toBeUndefined();
  });

  it('exposes a valid http(s) base URL and the model through Env', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.test/api';
    process.env.ANTHROPIC_MODEL = 'model-env-test';
    const { env } = await importEnv(DB);
    expect(env.ANTHROPIC_BASE_URL).toBe('https://proxy.example.test/api');
    expect(env.ANTHROPIC_MODEL).toBe('model-env-test');
  });

  for (const bad of ['not-a-url-s3cret', 'ftp://user:s3cretpw@proxy.example.test/x', 'proxy.example.test:s3cretpw']) {
    it(`throws naming the variable, never the value, for ${bad.split(':')[0]}`, async () => {
      process.env.ANTHROPIC_BASE_URL = bad;
      let message = '';
      try {
        await importEnv(DB);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/ANTHROPIC_BASE_URL/);
      expect(message).not.toContain(bad);
      expect(message).not.toContain('s3cret');
    });
  }
});
