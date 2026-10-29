// Header layout at 375px. happy-dom computes no layout, so the stylesheet is read
// (same approach as shell-header.test.ts); the 375px screenshot is the real proof.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'shell.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function body(selector: string): string {
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  let out = '';
  while ((m = re.exec(css)) !== null) {
    if (m[1].split(',').map((s) => s.trim()).includes(selector)) out += m[2];
  }
  return out;
}

describe('header nav layout', () => {
  it('the header wraps instead of overflowing, so the nav can never cover Log out at 375px', () => {
    expect(body('.shell-header')).toMatch(/flex-wrap:\s*wrap/);
  });

  it('the nav can shrink and its links wrap (min-width: 0), and Log out is pushed right', () => {
    expect(body('.shell-nav')).toMatch(/min-width:\s*0/);
    expect(body('.shell-header .auth-logout')).toMatch(/margin-inline-start:\s*auto/);
  });

  it('nav links are 44px tap targets, current one carries a non-colour mark, focus ring is the token', () => {
    expect(body('.shell-nav a')).toMatch(/min-height:\s*44px/);
    expect(body('.shell-nav a[aria-current]')).toMatch(/font-weight:\s*600/);
    expect(body('.shell-nav a[aria-current]')).toMatch(/border-bottom|text-decoration/);
    expect(body('.shell-nav a:focus-visible')).toMatch(/box-shadow:\s*var\(--shadow-focus\)/);
  });

  it('uses no amber (question) or danger (error) token for nav state', () => {
    const navCss = [...css.matchAll(/[^{}@]*\.shell-nav[^{}]*\{[^{}]*\}/g)].map((m) => m[0]).join('\n');
    expect(navCss.length).toBeGreaterThan(0);
    expect(navCss).not.toMatch(/--color-(question|danger)/);
  });
});
