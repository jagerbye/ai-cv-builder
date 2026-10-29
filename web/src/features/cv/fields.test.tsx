// QA-06 (major). Multiline fields are <textarea rows={2}> with no auto-grow, so a
// 300-character bullet shows two lines and a third sliced through its glyphs at
// 375px. design.json components.textarea sets autogrow: true, so the field must grow
// with its content (or scroll honestly within a cap). happy-dom has no layout
// engine, so scrollHeight is stubbed from the text length (about 40 characters per
// line at 375px). The rule under test is "the field fits its content", not pixels.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { cvA, installApi, mountEditor, registerEditorHooks, setViewport } from './testkit';

registerEditorHooks();

const CHARS_PER_LINE = 40;
const LINE_PX = 24;
const PADDING_PX = 20;

// A 300-character bullet, the length the seed provides.
const SEED_BULLET = (
  'Migrated the settlement ledger to event sourcing and cut the nightly reconciliation from six hours to forty minutes, ' +
  'with the reviewers signing off each stage. '
).slice(0, 300);

const SEED_SUMMARY = (
  'Backend engineer with nine years of payments work across settlement, ledgers and reconciliation, ' +
  'mostly in Go and PostgreSQL, with a habit of writing the runbook before the feature ships. '
).slice(0, 300);

// The stylesheets the editor ships with. A field may grow by the field-sizing rule
// instead of by script, so the check accepts either.
const here = dirname(fileURLToPath(import.meta.url));
const shippedCss = readdirSync(here)
  .filter((f) => f.endsWith('.css'))
  .map((f) => readFileSync(join(here, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  .join('\n');

let restoreScrollHeight: (() => void) | null = null;

function stubScrollHeight() {
  const original = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'scrollHeight');
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      return Math.ceil(this.value.length / CHARS_PER_LINE) * LINE_PX + PADDING_PX;
    },
  });
  restoreScrollHeight = () => {
    if (original) Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', original);
    else delete (HTMLTextAreaElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  };
}

afterEach(() => {
  restoreScrollHeight?.();
  restoreScrollHeight = null;
});

// True when the field shows all of its content: either its inline height is at
// least its content height, or the shipped CSS sizes textareas to their content.
function fitsContent(field: HTMLTextAreaElement): boolean {
  const inline = parseFloat(field.style.height);
  if (Number.isFinite(inline) && inline >= field.scrollHeight) return true;
  return /field-sizing:\s*content/.test(shippedCss);
}

describe('QA-06: long content is not clipped in multiline fields', () => {
  it('the 300-character bullet fits its textarea at 375px (not two rows)', async () => {
    setViewport(375);
    stubScrollHeight();
    const cv = cvA();
    cv.experience[0].bullets[0].text = SEED_BULLET;
    installApi([cv]);
    mountEditor('/cvs/cv-1');
    const entry = within(await screen.findByRole('region', { name: 'Experience' })).getAllByRole('article')[0];
    const bullet = within(entry).getAllByRole('textbox', { name: 'Bullet' })[0] as HTMLTextAreaElement;
    expect(bullet.value).toBe(SEED_BULLET);
    await waitFor(() => expect(fitsContent(bullet)).toBe(true));
  });

  it('the long summary fits its textarea at 375px', async () => {
    setViewport(375);
    stubScrollHeight();
    const cv = cvA();
    cv.summary = { text: SEED_SUMMARY, factIds: ['f-1'], userEdited: false };
    installApi([cv]);
    mountEditor('/cvs/cv-1');
    const summary = within(await screen.findByRole('region', { name: 'Summary' })).getByRole('textbox', {
      name: 'Summary',
    }) as HTMLTextAreaElement;
    expect(summary.value).toBe(SEED_SUMMARY);
    await waitFor(() => expect(fitsContent(summary)).toBe(true));
  });

  it('the field keeps fitting while the user types a longer bullet', async () => {
    setViewport(375);
    stubScrollHeight();
    const cv = cvA();
    cv.experience[0].bullets[0].text = SEED_BULLET;
    installApi([cv]);
    mountEditor('/cvs/cv-1');
    const entry = within(await screen.findByRole('region', { name: 'Experience' })).getAllByRole('article')[0];
    const bullet = within(entry).getAllByRole('textbox', { name: 'Bullet' })[0] as HTMLTextAreaElement;
    fireEvent.change(bullet, { target: { value: SEED_BULLET + SEED_BULLET } });
    await waitFor(() => expect(fitsContent(bullet)).toBe(true));
  });
});
