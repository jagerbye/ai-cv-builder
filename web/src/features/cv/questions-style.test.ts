// T-27 — Colour and motion rules for questions (framework/docs/design/design.json):
// "Amber is questions and nothing else; red is errors only", and
// prefers-reduced-motion is honoured. happy-dom computes no styles, so these are
// static checks on the shipped CV stylesheets. They read the rules, not the pixels;
// the rendered colour is manual QA with screenshots (framework/process/qa-playbook.md).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const css = readdirSync(here)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(here, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  .join('\n');

// Flat rules: selector and body, for every rule whose body has no nested braces
// (rules inside @media blocks are included).
function rules(source: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

// The text inside the block opened by the first occurrence of `marker`, by brace count.
function blockAfter(source: string, marker: string): string | null {
  const at = source.indexOf(marker);
  if (at < 0) return null;
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

describe('amber is for questions and nothing else (design.json colors.question)', () => {
  it('amber question tokens are used at all in the CV stylesheets', () => {
    expect(css).toMatch(/var\(--color-question-/);
  });

  it('every rule that paints with an amber question token names a question in its selector', () => {
    const offenders = rules(css)
      .filter((r) => /var\(--color-question-/.test(r.body))
      .filter((r) => !/question/i.test(r.selector))
      .map((r) => r.selector);
    expect(offenders).toEqual([]);
  });

  it('no error selector paints with an amber question token', () => {
    const offenders = rules(css)
      .filter((r) => /var\(--color-question-/.test(r.body))
      .filter((r) => /error|danger|conflict|alert|invalid|fail/i.test(r.selector))
      .map((r) => r.selector);
    expect(offenders).toEqual([]);
  });
});

describe('red is for errors only (design.json colors.danger)', () => {
  // A generic callout may be red because it is the conflict notice (an error), so
  // the check is about question cards: red may sit on a question only as an error.
  it('a question selector paints with a danger token only when the selector is an error', () => {
    const offenders = rules(css)
      .filter((r) => /var\(--color-danger-/.test(r.body))
      .filter((r) => /question/i.test(r.selector) && !/error/i.test(r.selector))
      .map((r) => r.selector);
    expect(offenders).toEqual([]);
  });
});

describe('prefers-reduced-motion is honoured (design.json motion.save_fade)', () => {
  it('the CV stylesheets carry a prefers-reduced-motion block', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/);
  });

  it('the reduced-motion block turns off the answered-card fade (transition or animation)', () => {
    const block = blockAfter(css, '@media (prefers-reduced-motion: reduce)') ?? '';
    expect(block).toMatch(/transition(-duration)?\s*:\s*(none|0s?|0ms)|animation(-duration)?\s*:\s*(none|0s?|0ms)/);
  });
});
