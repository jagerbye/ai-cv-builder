// T-05 (CVB-5) — mobile-first layout rules from spec §3.9 and design.json
// (breakpoints.two_column = 900px, tap_target_min = 44px, font_size_min = 14px).
// Static checks on shipped CSS: the 375x812 manual QA with screenshots is the
// real layout proof (framework/process/qa-playbook.md); these catch the rules
// that can be read from the stylesheet.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '..');
const tokensPath = resolve(here, 'tokens.css');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const cssFiles = walk(srcDir)
  .filter((f) => f.endsWith('.css') && f !== tokensPath)
  .map((f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
const allCss = cssFiles.join('\n');

// Splits a stylesheet into its @media blocks and the base (outside any media).
function splitMedia(css: string): { base: string; media: Array<{ query: string; body: string }> } {
  const media: Array<{ query: string; body: string }> = [];
  let base = '';
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf('@media', i);
    if (at < 0) {
      base += css.slice(i);
      break;
    }
    base += css.slice(i, at);
    const open = css.indexOf('{', at);
    const query = css.slice(at + 6, open).trim();
    let depth = 0;
    let j = open;
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    media.push({ query, body: css.slice(open + 1, j) });
    i = j + 1;
  }
  return { base, media };
  }

// Top-level tokens of a grid track list, so minmax(0, 720px) counts as one track.
function trackCount(value: string): number {
  let depth = 0;
  let tokens = 0;
  let inTok = false;
  for (const ch of value.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) {
      inTok = false;
      continue;
    }
    if (!inTok) {
      tokens++;
      inTok = true;
    }
  }
  return tokens;
}

describe('mobile-first layout (spec §3.9, CVB-5)', () => {
  it('precondition: shipped feature stylesheets exist, so the static checks below are not vacuous', () => {
    expect(cssFiles.length).toBeGreaterThan(0);
    expect(allCss).toMatch(/\{/);
  });

  it('the stylesheet contains a 900px min-width query that carries the two-column layout', () => {
    expect(allCss).toMatch(/@media\s*\(\s*min-width\s*:\s*900px\s*\)/);
    const { media } = splitMedia(allCss);
    const wide = media.filter((m) => /min-width\s*:\s*900px/.test(m.query));
    expect(wide.length).toBeGreaterThan(0);
    const twoTrack = wide.some((m) =>
      [...m.body.matchAll(/grid-template-columns\s*:\s*([^;}]+)/g)].some((g) => trackCount(g[1]) >= 2),
    );
    expect(twoTrack).toBe(true);
  });

  it('the base (narrow) layout is a single column: no two-track grid outside the 900px query', () => {
    expect(allCss).toMatch(/\{/);
    const { base } = splitMedia(allCss);
    const offenders = [...base.matchAll(/grid-template-columns\s*:\s*([^;}]+)/g)]
      .map((g) => g[1].trim())
      .filter((v) => trackCount(v) >= 2);
    expect(offenders).toEqual([]);
  });

  it('no base rule forces a fixed px width wider than the 375px viewport minus the 16px gutters (343px)', () => {
    expect(allCss).toMatch(/\{/);
    const { base } = splitMedia(allCss);
    const offenders: string[] = [];
    for (const m of base.matchAll(/(?<![-\w])(?:min-)?width\s*:\s*(\d+(?:\.\d+)?)px/g)) {
      if (Number(m[1]) > 343) offenders.push(m[0]);
    }
    expect(offenders).toEqual([]);
    expect(base).not.toMatch(/width\s*:\s*100vw/);
  });

  it('no declared font-size is below 14px (rem converted at 16px)', () => {
    const sizes: number[] = [];
    for (const m of allCss.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)(px|rem)/g)) {
      sizes.push(m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16);
    }
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((s) => s < 14)).toEqual([]);
  });

  it('interactive elements declare a 44px minimum tap target, and at least one does', () => {
    const interactive = /^(button|input|select|textarea|a|\[role="button"\])$/;
    const minHeights: number[] = [];
    for (const rule of allCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = rule[1].split(',').map((s) => s.trim());
      if (!selectors.some((s) => interactive.test(s))) continue;
      const h = /min-height\s*:\s*(\d+(?:\.\d+)?)(px|rem)/.exec(rule[2]);
      if (h) minHeights.push(h[2] === 'px' ? Number(h[1]) : Number(h[1]) * 16);
    }
    expect(minHeights.length).toBeGreaterThan(0);
    expect(minHeights.filter((h) => h < 44)).toEqual([]);
  });
});
