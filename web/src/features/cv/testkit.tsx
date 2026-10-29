// T-22 (CVB-15) + T-27 — shared test kit for the CV editor suites. Test support only.
//
// The network is the only thing mocked (fetch). The client, the route and
// TanStack Query run for real. The fake API below behaves like C-006/C-008/C-009:
// PATCH carries {version, patch}; a stale version answers 409 VERSION_CONFLICT;
// a patch replaces each field it names and absent fields are untouched.
// POST …/questions/:qid/answer applies the answer to the bound path only, skips
// userEdited items, and answers the question (C-009).
//
// Rendered-DOM contract the developer implements. Accessible names are the only
// handle the suites use; there are no test ids.
//   - Each CV section is a <section> named by its heading: Contact, Summary,
//     Experience, Education, Skills.
//   - Contact: textbox 'Full name', 'Email', 'Phone', 'Location', 'Links'
//     (one URL per line).
//   - Summary: textbox 'Summary'.
//   - Each experience and education entry is an <article>.
//     Experience article: textbox 'Employer', 'Role', 'Period', 'Location';
//     bullets are a <ul> of <li>, each with textbox 'Bullet' and buttons
//     'Move bullet up', 'Move bullet down', 'Delete bullet'; entry buttons 'Add bullet', 'Move up',
//     'Move down', 'Delete'.
//     Education article: textbox 'Institution', 'Degree', 'Period'; buttons
//     'Move up', 'Move down', 'Delete'.
//   - Skills: a <ul> of <li>, each with textbox 'Skill', buttons 'Move up',
//     'Move down' and 'Delete skill <name>'. The delete button shows the word
//     'Delete', like every other delete in the editor (design.json icons.rule).
//   - Section buttons: 'Add experience', 'Add education', 'Add skill'.
//   - A text field commits on blur. Add, delete and move commit at once.
//     Every commit is one PATCH /api/cvs/:id with body {version, patch}.
//   - Save indicator text: 'Saving…' while a PATCH is in flight, 'Saved' after.
//   - Save failures keep the typed text and show a 'Retry' button.
//   - 409 shows role=alert 'This CV was changed on another device.' with a
//     'Reload latest' button, and makes no automatic retry.
//
// Questions (T-27, F-005, design README §3, C-009):
//   - Each open question is a <div role="group"> named by its question text
//     (aria-labelledby). Inside it: the eyebrow text 'Question about <field
//     label>', textbox 'Your answer', button 'Save answer', button 'Skip for now'.
//   - Desktop (>= 900px): the card's inline style.top in px equals its field's
//     offsetTop. The card, or its nearest styled wrapper, carries that top.
//     A ResizeObserver re-measures it. A card is pushed down only as far as
//     needed to clear the card above it. The column keeps server order.
//   - Mobile (< 900px): the card sits inside the same <article>/<section> as its
//     field and follows that field in document order.
//   - Answering sends POST /api/cvs/:id/questions/:qid/answer with body {answer}.
//     No PATCH is sent for an answer. While in flight 'Save answer' is disabled.
//   - Copy contract for the truthful error states the suites read:
//       409: a message matching /already (been )?answered/i, no Retry button.
//       503: a message that says the answer was saved and that the draft could not
//            be updated (/saved/i and /could not update|couldn't update/i). It
//            never says the answer was lost. Recovery is a button, not a re-POST.
//   - The answered card shows the word 'Answered'. It leaves the list after
//     about 1.8s, or at once when prefers-reduced-motion is set.
import { vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CvRoute from './route';

export interface CvBullet {
  id: string;
  text: string;
  factIds: string[];
  userEdited: boolean;
}
export interface CvExperience {
  id: string;
  employer: string;
  role: string;
  period: string;
  location?: string;
  order: number;
  relevance: number;
  userEdited: boolean;
  bullets: CvBullet[];
}
export interface CvEducation {
  id: string;
  institution: string;
  degree?: string;
  period: string;
  order: number;
  userEdited: boolean;
}
export interface CvSkill {
  id: string;
  name: string;
  group?: string;
  factIds: string[];
  userEdited: boolean;
}
export interface CvQuestion {
  id: string;
  path: string;
  text: string;
  status: 'open' | 'answered' | 'dismissed';
}
export interface CvFact {
  id: string;
  kind: string;
  text: string;
  sourceQuote: string;
  source: 'document' | 'user';
}
export interface CvDto {
  id: string;
  title: string;
  targetRole: string;
  state: 'generating' | 'ready' | 'failed';
  version: number;
  updatedAt: string;
  contact: { fullName?: string; email?: string; phone?: string; location?: string; links: string[] };
  summary?: { text: string; factIds: string[]; userEdited: boolean };
  experience: CvExperience[];
  education: CvEducation[];
  skills: CvSkill[];
  questions: CvQuestion[];
  facts: CvFact[];
}
export type CvPatch = Partial<Pick<CvDto, 'contact' | 'summary' | 'experience' | 'education' | 'skills'>>;

// Two different CVs, so no assertion can pass against one hard-coded value.
export function cvA(): CvDto {
  return {
    id: 'cv-1',
    title: 'Payments backend',
    targetRole: 'Senior backend engineer',
    state: 'ready',
    version: 7,
    updatedAt: '2026-10-27T09:00:00.000Z',
    contact: {
      fullName: 'Ana Lovelace',
      email: 'ana@example.com',
      phone: '+44 20 7946 0001',
      location: 'London',
      links: ['https://github.com/ana-l'],
    },
    summary: { text: 'Backend engineer with nine years of payments work.', factIds: ['f-1'], userEdited: false },
    experience: [
      {
        id: 'exp-1',
        employer: 'Northwind Labs',
        role: 'Senior engineer',
        period: '2019 – 2023',
        location: 'Remote',
        order: 0,
        relevance: 1,
        userEdited: false,
        bullets: [
          { id: 'b-1', text: 'Cut settlement latency by 40%.', factIds: ['f-2'], userEdited: false },
          { id: 'b-2', text: 'Led a team of four.', factIds: ['f-3'], userEdited: false },
        ],
      },
      {
        id: 'exp-2',
        employer: 'Acme Corp',
        role: 'Engineer',
        period: '2015 – 2019',
        order: 1,
        relevance: 0.5,
        userEdited: false,
        bullets: [{ id: 'b-3', text: 'Built the invoicing service.', factIds: ['f-4'], userEdited: false }],
      },
    ],
    education: [
      { id: 'edu-1', institution: 'University of Leeds', degree: 'BSc Computer Science', period: '2011 – 2014', order: 0, userEdited: false },
    ],
    skills: [
      { id: 'sk-1', name: 'PostgreSQL', factIds: ['f-5'], userEdited: false },
      { id: 'sk-2', name: 'Go', factIds: ['f-6'], userEdited: false },
    ],
    questions: [],
    facts: [],
  };
}

export function cvB(): CvDto {
  return {
    id: 'cv-2',
    title: 'Compilers',
    targetRole: 'Principal engineer',
    state: 'ready',
    version: 12,
    updatedAt: '2026-10-20T08:00:00.000Z',
    contact: { fullName: 'Grace Hopper', email: 'grace@example.org', links: [] },
    summary: { text: 'Compiler pioneer.', factIds: ['f-9'], userEdited: false },
    experience: [
      {
        id: 'exp-9',
        employer: 'Harbor Systems',
        role: 'Principal engineer',
        period: '1967 – 1971',
        order: 0,
        relevance: 1,
        userEdited: false,
        bullets: [{ id: 'b-9', text: 'Shipped the first linker.', factIds: ['f-10'], userEdited: false }],
      },
    ],
    education: [
      { id: 'edu-9', institution: 'Vassar College', degree: 'BA Mathematics', period: '1924 – 1928', order: 0, userEdited: false },
    ],
    skills: [{ id: 'sk-9', name: 'COBOL', factIds: [], userEdited: false }],
    questions: [],
    facts: [],
  };
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export type PatchPlan =
  | { kind: 'apply' }
  | { kind: 'network' }
  | { kind: 'respond'; status: number; body: unknown };

// C-009 answers. 'apply' is the 200 path: the bound path is recomposed (unless its
// item is userEdited). 'recompose-failed' is the 503 path, which matches the real
// server (api/src/core/cv/answer.ts): the answer is stored, the question is answered,
// the version bumps, the CV content is unchanged, and the 503 body is the error
// envelope only, with no CV and no version in it.
export type AnswerPlan =
  | { kind: 'apply' }
  | { kind: 'recompose-failed' }
  | { kind: 'network' }
  | { kind: 'respond'; status: number; body: unknown };

export interface RecordedRequest {
  method: string;
  url: string;
  // Request bodies are arbitrary JSON that the assertions inspect field by field.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

// C-008 semantics. A named field replaces the stored one whole, arrays included.
function applyPatch(cv: CvDto, req: { version: number; patch: CvPatch }): CvDto {
  const next = structuredClone(cv);
  const p = req.patch;
  if (p.contact) next.contact = p.contact;
  if (p.summary) next.summary = p.summary;
  if (p.experience) next.experience = p.experience.map((e, i) => ({ ...e, id: e.id ?? `new-exp-${i}`, order: i }));
  if (p.education) next.education = p.education.map((e, i) => ({ ...e, id: e.id ?? `new-edu-${i}`, order: i }));
  if (p.skills) next.skills = p.skills.map((s, i) => ({ ...s, id: s.id ?? `new-sk-${i}` }));
  next.version = cv.version + 1;
  return next;
}

// C-009 semantics. The question is answered. For 'apply', the one path it binds to
// is recomposed with the answer, unless that item is userEdited (never touched).
// Everything else in the CV is left as it was.
// The top-level version bumps on every stored answer, 200 or 503 (C-009, ADR-015):
// it is the concurrency token, so a stored answer that leaves it still is a lie.
function applyAnswer(cv: CvDto, q: CvQuestion, answer: string, recompose: boolean): CvDto {
  const next = structuredClone(cv);
  next.version = cv.version + 1;
  next.questions = next.questions.map((x) => (x.id === q.id ? { ...x, status: 'answered' as const } : x));
  if (!recompose) return next;
  const contact = /^contact\.(\w+)$/.exec(q.path);
  if (contact) {
    (next.contact as unknown as Record<string, unknown>)[contact[1]] = answer;
    return next;
  }
  const item = /^(experience|education|skills)\[(\d+)\]\.(\w+)$/.exec(q.path);
  if (item) {
    const [, list, index, field] = item;
    const entries = next[list as 'experience' | 'education' | 'skills'] as unknown as Array<Record<string, unknown>>;
    const entry = entries[Number(index)];
    if (entry && entry.userEdited !== true) entry[field] = answer;
  }
  return next;
}

export interface FakeApi {
  requests: RecordedRequest[];
  patches(): RecordedRequest[];
  answers(): RecordedRequest[];
  gets(): string[];
  current(id: string): CvDto;
  // Simulates a change made on another device: stored and version bumped.
  setServer(id: string, cv: CvDto): void;
  // Answers the next PATCH as planned. hold=true keeps it pending until the
  // returned release() is called.
  planPatch(plan: PatchPlan, hold?: boolean): () => void;
  // Answers the next question answer as planned. hold=true keeps it pending
  // until the returned release() is called.
  planAnswer(plan: AnswerPlan, hold?: boolean): () => void;
  // Answers the next GET with this raw response instead of the stored CV.
  nextGet(res: Response): void;
}

export function installApi(initial: CvDto[]): FakeApi {
  const store = new Map<string, CvDto>(initial.map((cv) => [cv.id, structuredClone(cv)]));
  const requests: RecordedRequest[] = [];
  const plans: Array<{ plan: PatchPlan; hold: boolean }> = [];
  const answerPlans: Array<{ plan: AnswerPlan; hold: boolean }> = [];
  const getOverrides: Response[] = [];
  let releasers: Array<() => void> = [];
  let answerReleasers: Array<() => void> = [];

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, url, body });

    const answerMatch = /^\/api\/cvs\/([^/]+)\/questions\/([^/]+)\/answer$/.exec(url);
    if (answerMatch) {
      const [, cvId, questionId] = answerMatch;
      const queued = answerPlans.shift() ?? { plan: { kind: 'apply' } as AnswerPlan, hold: false };
      if (queued.hold) {
        await new Promise<void>((resolve) => answerReleasers.push(resolve));
      }
      const plan = queued.plan;
      if (plan.kind === 'network') throw new TypeError('Failed to fetch');
      if (plan.kind === 'respond') return jsonResponse(plan.status, plan.body);
      const current = store.get(cvId);
      if (!current) return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No CV with that id.' } });
      const question = current.questions.find((q) => q.id === questionId);
      if (!question) return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No such question.' } });
      const answer = typeof body?.answer === 'string' ? body.answer : '';
      if (answer.length < 1 || answer.length > 2000) {
        return jsonResponse(400, {
          error: { code: 'VALIDATION', message: 'Check the answer.', details: [{ path: 'answer', message: 'Required.' }] },
        });
      }
      if (question.status !== 'open') {
        return jsonResponse(409, { error: { code: 'CONFLICT', message: 'Question already answered.' } });
      }
      const recompose = plan.kind === 'apply';
      const next = applyAnswer(current, question, answer, recompose);
      store.set(cvId, next);
      if (plan.kind === 'recompose-failed') {
        return jsonResponse(503, {
          error: { code: 'LLM_UNAVAILABLE', message: 'The draft could not be recomposed.' },
        });
      }
      return jsonResponse(200, structuredClone(next));
    }

    const match = /^\/api\/cvs\/([^/]+)$/.exec(url);
    if (!match) return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No such route.' } });
    const id = match[1];
    const cv = store.get(id);
    if (method === 'GET') {
      const override = getOverrides.shift();
      if (override) return override;
      return cv
        ? jsonResponse(200, structuredClone(cv))
        : jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No CV with that id.' } });
    }
    if (method === 'PATCH') {
      const queued = plans.shift() ?? { plan: { kind: 'apply' } as PatchPlan, hold: false };
      if (queued.hold) {
        await new Promise<void>((resolve) => releasers.push(resolve));
      }
      const plan = queued.plan;
      if (plan.kind === 'network') throw new TypeError('Failed to fetch');
      if (plan.kind === 'respond') return jsonResponse(plan.status, plan.body);
      if (!cv) return jsonResponse(404, { error: { code: 'NOT_FOUND', message: 'No CV with that id.' } });
      if (body.version !== cv.version) {
        return jsonResponse(409, {
          error: { code: 'VERSION_CONFLICT', message: 'Stale version: reload the CV.' },
        });
      }
      const next = applyPatch(cv, body);
      store.set(id, next);
      return jsonResponse(200, structuredClone(next));
    }
    return jsonResponse(405, { error: { code: 'INTERNAL', message: 'Method not allowed.' } });
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    requests,
    patches: () => requests.filter((r) => r.method === 'PATCH'),
    answers: () => requests.filter((r) => r.method === 'POST' && r.url.endsWith('/answer')),
    gets: () => requests.filter((r) => r.method === 'GET').map((r) => r.url),
    current: (id) => structuredClone(store.get(id) as CvDto),
    setServer: (id, cv) => store.set(id, structuredClone(cv)),
    nextGet(res) {
      getOverrides.push(res);
    },
    planPatch(plan, hold = false) {
      plans.push({ plan, hold });
      return () => {
        const pending = releasers;
        releasers = [];
        pending.forEach((resolve) => resolve());
      };
    },
    planAnswer(plan, hold = false) {
      answerPlans.push({ plan, hold });
      return () => {
        const pending = answerReleasers;
        answerReleasers = [];
        pending.forEach((resolve) => resolve());
      };
    },
  };
}

// A fresh QueryClient per mount is what a page reload does: nothing survives in
// memory, so whatever the editor shows must come from the server.
export function mountEditor(path: string) {
  window.history.replaceState({}, '', path);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CvRoute />
    </QueryClientProvider>,
  );
}

// Commits one text field the way a user does: type, then leave the field.
export function commit(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
}

// Viewport and media stubs. Media queries are evaluated against the width, the
// way a browser would: (min-width: Npx) / (max-width: Npx) conditions.
function mediaMatches(query: string, width: number, reducedMotion: boolean): boolean {
  if (/prefers-reduced-motion:\s*reduce/.test(query)) return reducedMotion;
  const conds = [...query.matchAll(/\((min|max)-width:\s*(\d+(?:\.\d+)?)px\)/g)];
  if (conds.length === 0) return false;
  return conds.every(([, kind, px]) => (kind === 'min' ? width >= Number(px) : width <= Number(px)));
}

export function setViewport(width: number, opts: { reducedMotion?: boolean } = {}) {
  const reducedMotion = opts.reducedMotion ?? false;
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: mediaMatches(query, width, reducedMotion),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

// Layout stub. happy-dom has no layout engine, so offsetTop and offsetHeight come
// from a table the test sets. A field is found by its input's current value, so
// the table works from the first mount, before a test holds any element. Ancestors
// of the input report the same top, so the alignment may measure the input or any
// wrapper around it. Every role=group element (a question card) reports cardHeight.
export interface LayoutStage {
  setFieldTop(value: string, top: number): void;
  setCardHeight(px: number): void;
  restore(): void;
}

export function installLayout(): LayoutStage {
  const originalTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
  const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  const fieldTops = new Map<string, number>();
  let cardHeight = 0;

  function topOf(el: HTMLElement): number {
    if (el instanceof HTMLInputElement) return fieldTops.get(el.value) ?? 0;
    for (const input of Array.from(el.querySelectorAll('input'))) {
      const top = fieldTops.get(input.value);
      if (top !== undefined) return top;
    }
    return 0;
  }

  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      return topOf(this);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'group' ? cardHeight : 0;
    },
  });
  return {
    setFieldTop(value, top) {
      fieldTops.set(value, top);
    },
    setCardHeight(px) {
      cardHeight = px;
    },
    restore() {
      if (originalTop) Object.defineProperty(HTMLElement.prototype, 'offsetTop', originalTop);
      if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', originalHeight);
    },
  };
}

// ResizeObserver stub. fire() runs every observer callback, which is what a real
// size change on the observed sheet would do.
export function installResizeObserver() {
  const observers: Array<{ callback: ResizeObserverCallback }> = [];
  class FakeResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push({ callback });
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  return {
    fire() {
      for (const o of observers) o.callback([], {} as ResizeObserver);
    },
  };
}

export function resetEditorEnv() {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
  window.localStorage.clear();
  window.sessionStorage.clear();
}

export function registerEditorHooks() {
  afterEach(() => {
    resetEditorEnv();
  });
}
