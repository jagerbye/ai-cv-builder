// T-06 (CVB-6) — F-009 mobile criteria for the auth screens (spec.md §3.9).
// Static CSS read, like the T-05 mobile-layout suite. The 375x812 no-scroll
// proof stays manual QA (spec §3.9).
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const authDir = join(process.cwd(), 'src/features/auth');
const css = readdirSync(authDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(authDir, f), 'utf8'))
  .join('\n');

describe('auth screens on a phone (F-009, CVB-6)', () => {
  it('ships a stylesheet for the auth screens', () => {
    expect(css.length).toBeGreaterThan(0);
  });

  it('gives buttons and form controls a 44px minimum tap target', () => {
    expect(css).toMatch(/min-height:\s*44px/);
  });

  it('keeps every font-size at 14px or more', () => {
    const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(14);
  });

  it('sets no fixed minimum width wider than a 375px viewport less the 16px gutters', () => {
    expect(css.length).toBeGreaterThan(0);
    const widths = [...css.matchAll(/min-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
    for (const w of widths) expect(w).toBeLessThanOrEqual(343);
  });
});
