// T-27 — Questions beside the fields they ask about (F-005, F-006, C-009, design
// README §3). Acceptance tests written before the production code; they fail
// until the question column and the answer flow exist. Mocks only fetch (testkit).
// Desktop geometry is stubbed in the testkit (happy-dom has no layout engine); the
// rule being tested is the alignment logic, not pixels.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import {
  commit,
  cvA,
  installApi,
  installLayout,
  installResizeObserver,
  mountEditor,
  registerEditorHooks,
  setViewport,
  type CvDto,
  type CvQuestion,
  type LayoutStage,
} from './testkit';

registerEditorHooks();

const GENERIC_COPY = 'Something went wrong. Please try again.';
const ANSWER = 'Jan 2015 – Jun 2019, contract work and then full time';
const LOCATION_Q = 'Where are you based now?';
const ACME_Q = 'When did you join and leave Acme Corp?';
const DEGREE_Q = 'Which degree did you finish at Leeds?';
const NORTHWIND_Q = 'When did you start at Northwind Labs?';

// Field values that exist once, so the layout table can find each field.
const LONDON = 'London';
const ACME_PERIOD = '2015 – 2019';
const DEGREE_VALUE = 'BSc Computer Science';

const QUESTIONS: Record<string, CvQuestion> = {
  location: { id: 'q-location', path: 'contact.location', text: LOCATION_Q, status: 'open' },
  acme: { id: 'q-acme-period', path: 'experience[1].period', text: ACME_Q, status: 'open' },
  degree: { id: 'q-degree', path: 'education[0].degree', text: DEGREE_Q, status: 'open' },
};

// Questions in the order the server returns them (most load-bearing first).
function withQuestions(order: Array<keyof typeof QUESTIONS> = ['location', 'acme', 'degree']): CvDto {
  const cv = cvA();
  cv.questions = order.map((key) => QUESTIONS[key]);
  return cv;
}

// Northwind (experience[0]) is userEdited. A question binds to its period.
function withUserEditedQuestion(): CvDto {
  const cv = cvA();
  cv.experience[0].userEdited = true;
  cv.questions = [{ id: 'q-northwind', path: 'experience[0].period', text: NORTHWIND_Q, status: 'open' }];
  return cv;
}

function acmeEntry(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Experience' })).getAllByRole('article')[1];
}

function acmePeriod(): HTMLElement {
  return within(acmeEntry()).getByRole('textbox', { name: 'Period' });
}

function questionCard(text: string): HTMLElement {
  return screen.getByRole('group', { name: text });
}

// The card's own top, or the top of its nearest wrapper that sets one. Accepts a
// translateY as well, since a card may be placed by transform.
function cardTop(card: HTMLElement): string {
  for (let el: HTMLElement | null = card; el && el !== document.body; el = el.parentElement) {
    if (el.style.top) return el.style.top;
    const moved = /translateY\((-?[\d.]+px)\)/.exec(el.style.transform);
    if (moved) return moved[1];
  }
  return '';
}

function typeAnswer(card: HTMLElement, value: string) {
  fireEvent.change(within(card).getByRole('textbox', { name: 'Your answer' }), { target: { value } });
  fireEvent.click(within(card).getByRole('button', { name: 'Save answer' }));
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let layout: LayoutStage;
let resize: { fire(): void };

beforeEach(() => {
  layout = installLayout();
  resize = installResizeObserver();
});

afterEach(() => {
  layout.restore();
});

describe('questions beside their field — desktop alignment (F-005, design §3)', () => {
  it('places each card at the offsetTop of the field its path points at (1200px)', async () => {
    setViewport(1200);
    layout.setFieldTop(LONDON, 90);
    layout.setFieldTop(ACME_PERIOD, 300);
    layout.setFieldTop(DEGREE_VALUE, 520);
    installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: LOCATION_Q });
    expect(cardTop(questionCard(LOCATION_Q))).toBe('90px');
    expect(cardTop(questionCard(ACME_Q))).toBe('300px');
    expect(cardTop(questionCard(DEGREE_Q))).toBe('520px');
  });

  it('uses the desktop alignment from exactly 900px', async () => {
    setViewport(900);
    layout.setFieldTop(ACME_PERIOD, 300);
    installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    expect(cardTop(questionCard(ACME_Q))).toBe('300px');
  });

  it('re-measures when the sheet resizes (ResizeObserver), not only on first render', async () => {
    setViewport(1200);
    layout.setFieldTop(ACME_PERIOD, 300);
    installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    expect(cardTop(questionCard(ACME_Q))).toBe('300px');

    layout.setFieldTop(ACME_PERIOD, 420);
    act(() => resize.fire());
    await waitFor(() => expect(cardTop(questionCard(ACME_Q))).toBe('420px'));
  });

  it('pushes a card down only as far as needed to clear the card above it', async () => {
    setViewport(1200);
    layout.setFieldTop(LONDON, 300);
    layout.setFieldTop(ACME_PERIOD, 310);
    layout.setCardHeight(100);
    installApi([withQuestions(['location', 'acme'])]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: LOCATION_Q });
    expect(cardTop(questionCard(LOCATION_Q))).toBe('300px');
    const pushed = parseFloat(cardTop(questionCard(ACME_Q)));
    // It must clear the card above (300 + 100) but not sit far below its own field (310).
    expect(pushed).toBeGreaterThanOrEqual(400);
    expect(pushed).toBeLessThanOrEqual(420);
  });

  it('keeps the server order in the column and never re-sorts by position', async () => {
    setViewport(1200);
    installApi([withQuestions(['acme', 'location', 'degree'])]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    const acme = questionCard(ACME_Q);
    const location = questionCard(LOCATION_Q);
    const degree = questionCard(DEGREE_Q);
    expect(acme.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(location.compareDocumentPosition(degree) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('questions beside their field — mobile collapse (F-005)', () => {
  it('under 900px the Period question sits inside its own entry, after the Period field', async () => {
    setViewport(375);
    installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    const card = within(acmeEntry()).getByRole('group', { name: ACME_Q });
    expect(acmePeriod().compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('under 900px the Location question sits inside the Contact section under its field', async () => {
    setViewport(375);
    installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    const contact = await screen.findByRole('region', { name: 'Contact' });
    const card = within(contact).getByRole('group', { name: LOCATION_Q });
    const location = within(contact).getByRole('textbox', { name: 'Location' });
    expect(location.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('at 899px, just under the breakpoint, the card still sits under its field', async () => {
    setViewport(899);
    layout.setFieldTop(ACME_PERIOD, 300);
    installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    expect(within(acmeEntry()).getByRole('group', { name: ACME_Q })).toBeTruthy();
  });
});

describe('answering a question (C-009, F-005)', () => {
  it('posts the answer to the question id and path it belongs to, and sends no PATCH', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    await waitFor(() => expect(api.answers()).toHaveLength(1));
    const [answer] = api.answers();
    expect(answer.method).toBe('POST');
    expect(answer.url).toBe('/api/cvs/cv-1/questions/q-acme-period/answer');
    expect(Object.keys(answer.body)).toEqual(['answer']);
    expect(answer.body.answer).toBe(ANSWER);
    expect(api.patches()).toHaveLength(0);
  });

  it('sends nothing for a blank answer', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), '');
    await pause(50);
    expect(api.answers()).toHaveLength(0);
  });

  it('a second click while the answer is in flight sends one request and disables Save answer', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    const release = api.planAnswer({ kind: 'apply' }, true);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    fireEvent.click(within(questionCard(ACME_Q)).getByRole('button', { name: 'Save answer' }));
    const save = within(questionCard(ACME_Q)).getByRole('button', { name: 'Save answer' });
    expect(save.hasAttribute('disabled') || save.getAttribute('aria-disabled') === 'true').toBe(true);
    await pause(50);
    expect(api.answers()).toHaveLength(1);
    release();
    await screen.findByText('Answered');
  });

  it('shows the answer in its field and re-renders only the section the answer changed', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    const heading = screen.getByRole('heading', { level: 1 });
    const contact = screen.getByRole('region', { name: 'Contact' });
    const summary = screen.getByRole('textbox', { name: 'Summary' });
    const education = screen.getByRole('region', { name: 'Education' });
    const northwind = within(screen.getByRole('region', { name: 'Experience' })).getAllByRole('article')[0];

    typeAnswer(questionCard(ACME_Q), ANSWER);
    await waitFor(() => expect(acmePeriod()).toHaveProperty('value', ANSWER));

    expect(api.current('cv-1').experience[1].period).toBe(ANSWER);
    expect(screen.getByRole('heading', { level: 1 })).toBe(heading);
    expect(screen.getByRole('region', { name: 'Contact' })).toBe(contact);
    expect(screen.getByRole('textbox', { name: 'Summary' })).toBe(summary);
    expect(screen.getByRole('region', { name: 'Education' })).toBe(education);
    expect(within(screen.getByRole('region', { name: 'Experience' })).getAllByRole('article')[0]).toBe(northwind);
    expect(within(northwind).getByRole('textbox', { name: 'Period' })).toHaveProperty('value', '2019 – 2023');
  });

  it('never touches a userEdited field, even when a question points at it', async () => {
    setViewport(1200);
    const api = installApi([withUserEditedQuestion()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: NORTHWIND_Q });
    typeAnswer(questionCard(NORTHWIND_Q), 'Mar 2019 – Dec 2023');
    await waitFor(() => expect(api.answers()).toHaveLength(1));
    await pause(50);
    const northwind = within(screen.getByRole('region', { name: 'Experience' })).getAllByRole('article')[0];
    expect(within(northwind).getByRole('textbox', { name: 'Period' })).toHaveProperty('value', '2019 – 2023');
    expect(api.current('cv-1').experience[0].period).toBe('2019 – 2023');
    expect(api.patches()).toHaveLength(0);
  });

  it('with motion allowed, the answered card says Answered and leaves the list after a short delay', async () => {
    setViewport(1200);
    installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    await waitFor(() => expect(within(questionCard(ACME_Q)).getByText(/answered/i)).toBeTruthy());
    await waitFor(() => expect(screen.queryByRole('group', { name: ACME_Q })).toBeNull(), { timeout: 4000 });
  }, 8000);

  it('with prefers-reduced-motion the answered card leaves at once, with no timed fade', async () => {
    setViewport(1200, { reducedMotion: true });
    const api = installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    await waitFor(() => expect(api.answers()).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole('group', { name: ACME_Q })).toBeNull(), { timeout: 300 });
  });
});

describe('answer failures are shown truthfully (C-009)', () => {
  it('409 says the question was already answered and offers no retry', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    api.planAnswer({
      kind: 'respond',
      status: 409,
      body: { error: { code: 'CONFLICT', message: 'Question already answered.' } },
    });
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    const notice = await within(questionCard(ACME_Q)).findByText(/already (been )?answered/i);
    expect(notice).toBeTruthy();
    expect(within(questionCard(ACME_Q)).queryByRole('button', { name: /retry/i })).toBeNull();
    expect(screen.queryByText(GENERIC_COPY)).toBeNull();
    expect(api.answers()).toHaveLength(1);
  });

  it('503 says the answer was saved and the draft could not be updated, never that it was lost', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    api.planAnswer({ kind: 'recompose-failed' });
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    await within(questionCard(ACME_Q)).findByText(/could not update|couldn't update/i);
    const card = questionCard(ACME_Q);
    expect(card.textContent).toMatch(/saved/i);
    expect(card.textContent).not.toMatch(/lost|not saved|didn.t save|failed to save/i);
    expect(screen.queryByText(GENERIC_COPY)).toBeNull();
  });

  it('503 keeps the typed answer on screen', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    api.planAnswer({ kind: 'recompose-failed' });
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    await within(questionCard(ACME_Q)).findByText(/could not update|couldn't update/i);
    const shown =
      within(questionCard(ACME_Q)).queryByDisplayValue(ANSWER) ?? within(questionCard(ACME_Q)).queryByText(ANSWER);
    expect(shown).not.toBeNull();
  });

  it('503 offers a way forward that does not send the answer again', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    api.planAnswer({ kind: 'recompose-failed' });
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    await within(questionCard(ACME_Q)).findByText(/could not update|couldn't update/i);
    const recover = within(questionCard(ACME_Q)).getByRole('button', { name: /retry|try again|reload/i });
    fireEvent.click(recover);
    await pause(50);
    // The question is answered on the server; a second POST would only get 409.
    expect(api.answers()).toHaveLength(1);
  });

  it('a question card is never announced as an error', async () => {
    setViewport(1200);
    installApi([withQuestions()]);
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    expect(within(questionCard(ACME_Q)).queryAllByRole('alert')).toHaveLength(0);
  });
});

// QA-04 (blocker). A 503 on answer still bumps the CV's version on the server (C-009,
// ADR-015): the answer is stored and the question is answered. The next edit must
// carry the version the server now holds and save. A 409 "changed on another device"
// after the user's own answer is a false conflict that blocks every later save.
describe('QA-04: a 503 answer must not desync the version or block later saves', () => {
  it('after a 503 on answer, the next edit saves with no conflict banner and no discarded text', async () => {
    setViewport(1200);
    const api = installApi([withQuestions()]);
    api.planAnswer({ kind: 'recompose-failed' });
    mountEditor('/cvs/cv-1');
    await screen.findByRole('group', { name: ACME_Q });
    typeAnswer(questionCard(ACME_Q), ANSWER);
    await within(questionCard(ACME_Q)).findByText(/could not update|couldn't update/i);
    expect(api.current('cv-1').version).toBe(8);

    // The client must follow the server's version on its own. The pause lets a
    // client that re-reads the CV after the 503 finish before the user edits again.
    await pause(60);
    const summary = screen.getByRole('textbox', { name: 'Summary' });
    commit(summary, 'Edited after the failed recompose.');

    await waitFor(() => expect(api.patches()).toHaveLength(1));
    await pause(60);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/changed on another device/i)).toBeNull();
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(api.current('cv-1').summary?.text).toBe('Edited after the failed recompose.');
    expect(api.patches()).toHaveLength(1);
    expect((screen.getByRole('textbox', { name: 'Summary' }) as HTMLTextAreaElement).value).toBe(
      'Edited after the failed recompose.',
    );
  });
});
