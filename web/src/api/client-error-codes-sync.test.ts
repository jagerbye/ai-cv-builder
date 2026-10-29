// The web keeps a list of the codes it knows (client.ts). It cannot import the
// API's list, so this test is the tripwire: a code added to the C-000 enum in
// api/src/http/errors.ts must be added to the web list in the same change.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ERROR_CODES } from './client';

describe('web ERROR_CODES matches the API enum', () => {
  it('lists exactly the codes of api/src/http/errors.ts', () => {
    const src = readFileSync(resolve(process.cwd(), '../api/src/http/errors.ts'), 'utf8');
    const block = /export const ERROR_CODES = \[([\s\S]*?)\] as const/.exec(src);
    expect(block).not.toBeNull();
    const apiCodes = [...(block as RegExpExecArray)[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect([...ERROR_CODES].sort()).toEqual([...apiCodes].sort());
  });
});
