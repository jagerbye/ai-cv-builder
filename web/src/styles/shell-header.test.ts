// QA-07 (visual). The signed-in header is <span class="shell-brand"> then the
// Log out button, both laid out at the left with no gap and no push, so the button
// paints over the end of "AI CV Builder" (QA-07 screenshot 04). The header must put
// the brand at the left and the action at the right. Static check on the shipped
// stylesheets, since happy-dom computes no layout. The 375px and 1440px screenshots
// are the real proof (framework/process/qa-playbook.md).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '..');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}

const allCss = walk(srcDir)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  .join('\n');

// Flat rules (no nested braces): selector and body.
function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

const headerRules = rules(allCss).filter((r) => r.selector.split(',').map((s) => s.trim()).includes('.shell-header'));
const logoutRules = rules(allCss).filter((r) => /\.auth-logout\b/.test(r.selector));

describe('QA-07: the brand and the header action are separated (spec header layout)', () => {
  it('precondition: the header and the logout button are styled, so the checks below are not vacuous', () => {
    expect(headerRules.length).toBeGreaterThan(0);
    expect(logoutRules.length).toBeGreaterThan(0);
  });

  it('the header spreads its children to opposite ends (justify-content: space-between)', () => {
    const spread = headerRules.some((r) => /justify-content:\s*space-between/.test(r.body));
    const pushed = [...headerRules, ...logoutRules].some((r) => /margin(-inline-start|-left):\s*auto/.test(r.body));
    expect(spread || pushed).toBe(true);
  });

  it('the header sets a gap or a push, so the action never sits flush against the brand', () => {
    const gap = headerRules.some((r) => /(^|;|\s)gap:\s*\S/.test(r.body));
    const pushed = [...headerRules, ...logoutRules].some((r) => /margin(-inline-start|-left):\s*auto/.test(r.body));
    expect(gap || pushed).toBe(true);
  });
});
