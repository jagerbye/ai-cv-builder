import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-09 (CVB-9), C-012 / testing-strategy "exactly one seam": the gateway is the
// ONLY module in api/src allowed to import the Anthropic SDK. Test files are
// excluded because they name the SDK in mocks and assertions.

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

describe('C-012 seam: only the gateway imports the SDK', () => {
  it('lists exactly one production module importing @anthropic-ai/sdk, the gateway', () => {
    const importers = walk(SRC_ROOT)
      .filter((file) => /from\s+['"]@anthropic-ai\/sdk['"]|(?:require|import)\(\s*['"]@anthropic-ai\/sdk['"]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC_ROOT, file).split('\\').join('/'))
      .sort();
    expect(importers).toEqual(['core/generation/gateway.ts']);
  });
});
