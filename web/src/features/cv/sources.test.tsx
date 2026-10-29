// B-022 / F-004 — the facts screen: any generated line can show where it came from.
// Mocks only fetch (testkit). Assertions read the quote text of the mocked C-006 facts.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { screen, waitFor, within, fireEvent } from '@testing-library/react';
import { cvA, installApi, mountEditor, registerEditorHooks, setViewport, type CvDto } from './testkit';

registerEditorHooks();

const Q_LATENCY = 'we cut settlement latency from 9s to 5s (-40%) in 2021';
const Q_SUMMARY_A = 'nine years building payment backends';
const USER_FACT_TEXT = 'Led a team of four engineers from 2020';

function withFacts(): CvDto {
  const cv = cvA();
  cv.facts = [
    { id: 'f-1', kind: 'other', text: 'Nine years of payments', sourceQuote: Q_SUMMARY_A, source: 'document' },
    { id: 'f-2', kind: 'achievement', text: 'Cut latency 40%', sourceQuote: Q_LATENCY, source: 'document' },
    { id: 'f-3', kind: 'achievement', text: USER_FACT_TEXT, sourceQuote: '', source: 'user' },
  ];
  // b-1 cites f-2 (document); b-2 cites f-3 (user) and f-2; summary cites f-1.
  cv.experience[0].bullets[1].factIds = ['f-3', 'f-2'];
  cv.skills[1].factIds = []; // Go: no citation
  return cv;
}

async function open(width = 375) {
  setViewport(width);
  installApi([withFacts()]);
  mountEditor('/cvs/cv-1');
  await screen.findByRole('textbox', { name: 'Full name' });
}

function bulletItem(n: number): HTMLElement {
  return within(screen.getByRole('region', { name: 'Experience' })).getAllByRole('listitem')[n];
}
function skillItem(n: number): HTMLElement {
  return within(screen.getByRole('region', { name: 'Skills' })).getAllByRole('listitem')[n];
}
const toggle = (scope: HTMLElement) => within(scope).getByRole('button', { name: /source/i });

describe('facts screen (B-022)', () => {
  beforeEach(() => setViewport(375));

  it('shows nothing until asked, then the verbatim quote of the cited fact', async () => {
    await open();
    const li = bulletItem(0);
    expect(within(li).queryByText(Q_LATENCY)).toBeNull();
    const btn = toggle(li);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(within(li).getByText(Q_LATENCY)).toBeTruthy();
    // a fact this bullet does not cite stays out
    expect(within(li).queryByText(Q_SUMMARY_A)).toBeNull();
  });

  it('tells a document fact from the user\'s own answer, and shows the answer text when there is no quote', async () => {
    await open();
    const li = bulletItem(1);
    fireEvent.click(toggle(li));
    const doc = within(li).getByText(Q_LATENCY).closest('li, blockquote, div') as HTMLElement;
    expect(within(doc.parentElement as HTMLElement).getAllByText('From your document').length).toBe(1);
    const user = within(li).getByText(USER_FACT_TEXT);
    expect(within(user.parentElement as HTMLElement).getByText('From your answer')).toBeTruthy();
    // a user fact has no quote: the line says so rather than showing an empty quote
    expect(within(li).getAllByText(/From your (document|answer)/).map((e) => e.textContent)).toEqual([
      'From your answer',
      'From your document',
    ]);
  });

  it('works for the summary too', async () => {
    await open();
    const section = screen.getByRole('region', { name: 'Summary' });
    fireEvent.click(toggle(section));
    expect(within(section).getByText(Q_SUMMARY_A)).toBeTruthy();
  });

  it('says plainly when a line cites nothing', async () => {
    await open();
    const li = skillItem(1);
    fireEvent.click(toggle(li));
    expect(within(li).getByText('No source cited for this line.')).toBeTruthy();
  });

  it('says a user-edited line is the user\'s own and shows no quote for it', async () => {
    const cv = withFacts();
    cv.experience[0].bullets[0].userEdited = true;
    setViewport(375);
    installApi([cv]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('textbox', { name: 'Full name' });
    const li = bulletItem(0);
    fireEvent.click(toggle(li));
    expect(within(li).getByText('This line is your own wording, not taken from the document.')).toBeTruthy();
    expect(within(li).queryByText(Q_LATENCY)).toBeNull();
  });

  it('a line edited in this session becomes the user\'s own at once', async () => {
    await open();
    const li = bulletItem(0);
    const box = within(li).getByRole('textbox', { name: 'Bullet' });
    fireEvent.change(box, { target: { value: 'Rewrote it myself.' } });
    fireEvent.blur(box);
    fireEvent.click(toggle(li));
    expect(within(li).getByText('This line is your own wording, not taken from the document.')).toBeTruthy();
    expect(within(li).queryByText(Q_LATENCY)).toBeNull();
  });

  it('a cited id missing from facts is reported, not rendered blank', async () => {
    const cv = withFacts();
    cv.skills[0].factIds = ['f-404'];
    setViewport(375);
    installApi([cv]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('textbox', { name: 'Full name' });
    const li = skillItem(0);
    fireEvent.click(toggle(li));
    expect(within(li).getByText('The cited source is no longer available.')).toBeTruthy();
  });

  it('is keyboard reachable: a native button, Enter-able, and Escape closes it and returns focus', async () => {
    await open();
    const li = bulletItem(0);
    const btn = toggle(li);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.hasAttribute('disabled')).toBe(false);
    expect(btn.getAttribute('tabindex')).not.toBe('-1');
    // the button controls a region that is named
    fireEvent.click(btn); // a native button turns Enter/Space into click
    const region = within(li).getByRole('region', { name: /source/i });
    expect(btn.getAttribute('aria-controls')).toBe(region.id);
    // focus moves into the panel so Escape is heard from where the reader is
    expect(region.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    await waitFor(() => expect(within(li).queryByText(Q_LATENCY)).toBeNull());
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(btn);
  });

  it('Escape does not eat the key when the panel is closed', async () => {
    await open();
    const li = bulletItem(0);
    const box = within(li).getByRole('textbox', { name: 'Bullet' });
    box.focus();
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(document.activeElement).toBe(box);
  });

  it.each([375, 1200])('sits inside the field\'s own item at %ipx, like a question card', async (w) => {
    await open(w);
    const li = bulletItem(0);
    const field = within(li).getByRole('textbox', { name: 'Bullet' });
    const btn = toggle(li);
    expect(li.contains(btn)).toBe(true);
    // follows the field in document order
    expect(field.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // a header field with no factIds has no source control
    const article = within(screen.getByRole('region', { name: 'Experience' })).getAllByRole('article')[0];
    expect(within(within(article).getByRole('textbox', { name: 'Employer' }).parentElement as HTMLElement).queryByRole('button')).toBeNull();
  });

  it('adds no icon and borrows no amber', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(here, 'cv.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = css.match(/[^{}]*\.cv-source[^{}]*\{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) expect(r).not.toMatch(/question/);
    expect(readFileSync(join(here, 'sources.tsx'), 'utf8')).not.toMatch(/<svg|question-/);
  });
});
