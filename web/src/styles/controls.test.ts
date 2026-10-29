// QA-08 (visual). Native controls escape the design system: a link renders in the
// browser default blue (#0000EE), and the Regenerate <button> has no class, so it
// paints as a grey system button. Colours come from design.json colors.text.link
// (#215E6B) and the button tokens. Global element defaults belong in
// styles/base.css, so every page gets them. Static check on the shipped stylesheets;
// happy-dom computes no styles.
//
// Not covered here, and owned by other lanes: the PDF chooser is a raw
// <input type="file"> in features/intake/route.tsx. Its file label text comes from
// the browser locale, which no stylesheet can change; only hiding the native input
// behind a token-styled control fixes it, and that lives in the intake route.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const base = readFileSync(join(here, 'base.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function rules(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}

// True when some rule's selector list includes exactly `element` (a bare tag).
function bareSelectorRules(element: string) {
  return rules(base).filter((r) => r.selector.split(',').map((s) => s.trim()).includes(element));
}

describe('QA-08: bare links and buttons take the design tokens (design.json colors)', () => {
  it('a bare anchor is styled in the link colour token, not the browser default blue', () => {
    const anchor = bareSelectorRules('a');
    expect(anchor.some((r) => /color:\s*var\(--color-text-link\)/.test(r.body))).toBe(true);
  });

  it('a bare button, such as the unclassed Regenerate button, takes a token colour and border', () => {
    const button = bareSelectorRules('button');
    expect(button.some((r) => /var\(--color-/.test(r.body))).toBe(true);
    expect(button.some((r) => /border(-color)?:[^;]*var\(--color-/.test(r.body))).toBe(true);
  });
});
