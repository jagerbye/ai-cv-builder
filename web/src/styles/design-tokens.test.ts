// T-05 (CVB-5) — design tokens. Source of truth: framework/docs/design/design.json.
// Contract: web/src/styles/tokens.css defines the tokens on :root, names mapped
// mechanically (colors.text.primary -> --color-text-primary, spacing.6 -> --space-6,
// radius.md -> --radius-md, typography.scale.h2.size -> --text-h2-size).
// Components and feature code use var(--...) only: no raw hex, rgb(), or px
// spacing literals outside tokens.css.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // web/src/styles
const srcDir = resolve(here, '..'); // web/src
const webDir = resolve(srcDir, '..');
const tokensPath = resolve(here, 'tokens.css');
const design = JSON.parse(
  readFileSync(resolve(webDir, '..', 'framework/docs/design/design.json'), 'utf8'),
);

const norm = (v: string) => v.replace(/\s+/g, '').toLowerCase();

function cssVars(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(`--${m[1]}`, m[2].trim());
  }
  return out;
}

function leaves(obj: unknown, prefix: string[] = []): Array<[string[], string]> {
  if (typeof obj === 'string') return [[prefix, obj]];
  if (obj && typeof obj === 'object') {
    return Object.entries(obj).flatMap(([k, v]) => leaves(v, [...prefix, k]));
  }
  return [];
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    return [p];
  });
}

// Shipped source only: .ts/.tsx/.css, minus tests and the token file itself.
const sourceFiles = walk(srcDir)
  .filter((f) => /\.(tsx?|css)$/.test(f))
  .filter((f) => !/\.test\.tsx?$/.test(f))
  .filter((f) => f !== tokensPath)
  .map((f) => relative(srcDir, f));

describe('design tokens (T-05, CVB-5)', () => {
  it('defines every design.json colour as a CSS variable with the same value', () => {
    const vars = cssVars(readFileSync(tokensPath, 'utf8'));
    const entries = leaves(design.colors);
    expect(entries.length).toBeGreaterThan(20);
    const mismatches: string[] = [];
    for (const [path, value] of entries) {
      const name = `--color-${path.join('-').replace(/_/g, '-')}`;
      const actual = vars.get(name);
      if (actual === undefined || norm(actual) !== norm(value)) {
        mismatches.push(`${name}: expected ${value}, got ${actual ?? 'undefined'}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('defines spacing, radius and the h2 type size with the mechanical names', () => {
    const vars = cssVars(readFileSync(tokensPath, 'utf8'));
    expect(vars.get('--space-4')).toBe(design.spacing['4']);
    expect(vars.get('--space-6')).toBe(design.spacing['6']);
    expect(vars.get('--space-8')).toBe(design.spacing['8']);
    expect(vars.get('--radius-md')).toBe(design.radius.md);
    expect(vars.get('--radius-sm')).toBe(design.radius.sm);
    expect(vars.get('--text-h2-size')).toBe(design.typography.scale.h2.size);
  });

  it('a wrong token value fails: the expected value is not the one any other token holds (negative case)', () => {
    const vars = cssVars(readFileSync(tokensPath, 'utf8'));
    expect(vars.get('--color-accent-default')).not.toBe('#E4FF3B');
    expect(norm(vars.get('--color-accent-default') ?? '')).toBe(norm(design.colors.accent.default));
  });

  it('shipped source uses no raw hex or rgb() colour literals', () => {
    expect(sourceFiles).toContain('app/App.tsx');
    const offenders: string[] = [];
    for (const f of sourceFiles) {
      const text = readFileSync(join(srcDir, f), 'utf8');
      if (/#[0-9a-fA-F]{3,8}\b/.test(text) || /\brgba?\(/.test(text)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('shipped CSS sets spacing only through var(--space-*), never raw px (negative case: 0 is allowed)', () => {
    const cssFiles = sourceFiles.filter((f) => f.endsWith('.css'));
    expect(cssFiles.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of cssFiles) {
      const text = readFileSync(join(srcDir, f), 'utf8');
      for (const m of text.matchAll(/(?:^|[\s;{])(?:margin|padding|gap|row-gap|column-gap)(?:-[a-z]+)?\s*:\s*([^;}]+)/g)) {
        if (/(?<![\w-])[1-9]\d*(?:\.\d+)?px\b/.test(m[1])) offenders.push(`${f}: ${m[1].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
