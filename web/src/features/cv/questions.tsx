// T-27 — questions beside the fields they ask about (F-005, design README §3, C-009).
// Desktop (>= 900px): one column of cards in server order. Each card is absolutely
// placed at the offsetTop of its field, pushed down only to clear the card above.
// Mobile: each card sits directly under its field, inside the same entry.
import {
  createContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { CvDraft, CvQuestion } from './types';

export const SAVE_FADE_MS = 1800;
const TWO_COLUMN_QUERY = '(min-width: 900px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const CARD_GAP = 8;

// Where a question's answer stands in this session. 'answered' fades out after
// SAVE_FADE_MS; the 409 and 503 states stay until the user reloads the CV.
export type AnswerKind = 'busy' | 'answered' | 'conflict' | 'recompose-failed' | 'error';

export interface QuestionScope {
  inline: boolean;
  marked(path: string): boolean;
  cardsFor(path: string): ReactNode;
}

export const QuestionScopeContext = createContext<QuestionScope | null>(null);

function mediaMatches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

export function prefersReducedMotion(): boolean {
  return mediaMatches(REDUCED_MOTION_QUERY);
}

export function useTwoColumn(): boolean {
  const [two, setTwo] = useState(() => mediaMatches(TWO_COLUMN_QUERY));
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(TWO_COLUMN_QUERY);
    const onChange = () => setTwo(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return two;
}

const CONTACT_LABELS: Record<string, string> = {
  'contact.fullName': 'Full name',
  'contact.email': 'Email',
  'contact.phone': 'Phone',
  'contact.location': 'Location',
  'contact.links': 'Links',
  'summary.text': 'Summary',
};
const LAST_SEGMENT_LABELS: Record<string, string> = {
  employer: 'Employer',
  role: 'Role',
  period: 'Period',
  location: 'Location',
  institution: 'Institution',
  degree: 'Degree',
  name: 'Skill',
};

// The visible label of the field a question path points at.
export function fieldLabel(path: string): string {
  if (CONTACT_LABELS[path]) return CONTACT_LABELS[path];
  if (/bullets\[\d+\]\.text$/.test(path)) return 'Bullet';
  const last = path.split('.').pop() ?? '';
  return LAST_SEGMENT_LABELS[last] ?? 'this field';
}

// The draft section a question path belongs to (C-009 changes only that section).
export function sectionOf(path: string): keyof CvDraft | null {
  const match = /^(contact|summary|experience|education|skills)\b/.exec(path);
  return match ? (match[1] as keyof CvDraft) : null;
}

// Every path a rendered field carries. A question whose path is not in this set
// has no field to sit beside, so it is shown after the sheet instead.
export function fieldPathsOf(draft: CvDraft): Set<string> {
  const out = new Set<string>(Object.keys(CONTACT_LABELS));
  for (let i = 0; i < draft.experience.length; i++) {
    for (const f of ['employer', 'role', 'period', 'location']) out.add(`experience[${i}].${f}`);
    const bullets = draft.experience[i].bullets;
    for (let j = 0; j < bullets.length; j++) out.add(`experience[${i}].bullets[${j}].text`);
  }
  for (let i = 0; i < draft.education.length; i++) {
    for (const f of ['institution', 'degree', 'period']) out.add(`education[${i}].${f}`);
  }
  for (let i = 0; i < draft.skills.length; i++) out.add(`skills[${i}].name`);
  return out;
}

export interface QuestionCardProps {
  question: CvQuestion;
  kind: AnswerKind | undefined;
  style?: CSSProperties;
  onAnswer: (text: string) => void;
  onDone: () => void;
  onSkip: () => void;
  onReload: () => void;
}

export function QuestionCard({ question, kind, style, onAnswer, onDone, onSkip, onReload }: QuestionCardProps) {
  const titleId = useId();
  const answerId = useId();
  const [text, setText] = useState('');
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    if (kind !== 'answered') return;
    if (prefersReducedMotion()) {
      doneRef.current();
      return;
    }
    const timer = setTimeout(() => doneRef.current(), SAVE_FADE_MS);
    return () => clearTimeout(timer);
  }, [kind]);

  const busy = kind === 'busy';
  const closed = kind === 'answered' || kind === 'conflict' || kind === 'recompose-failed';
  const canSend = !busy && !closed && text.trim() !== '';
  return (
    <div
      role="group"
      aria-labelledby={titleId}
      data-question-id={question.id}
      className={kind === 'answered' ? 'cv-question cv-question-answered' : 'cv-question'}
      style={style}
    >
      <p className="cv-question-eyebrow">Question about {fieldLabel(question.path)}</p>
      <p id={titleId} className="cv-question-text">
        {question.text}
      </p>
      <label htmlFor={answerId} className="cv-question-label">
        Your answer
      </label>
      <textarea
        id={answerId}
        rows={2}
        value={text}
        readOnly={busy || closed}
        onChange={(e) => setText(e.target.value)}
      />
      {!closed && (
        <div className="cv-actions">
          <button type="button" className="cv-button" disabled={!canSend} onClick={() => onAnswer(text.trim())}>
            Save answer
          </button>
          <button type="button" className="cv-button" onClick={onSkip}>
            Skip for now
          </button>
        </div>
      )}
      <QuestionNotice kind={kind} onReload={onReload} />
    </div>
  );
}

function QuestionNotice({ kind, onReload }: { kind: AnswerKind | undefined; onReload: () => void }) {
  switch (kind) {
    case 'answered':
      return (
        <p role="status" className="cv-question-status">
          Answered
        </p>
      );
    case 'conflict':
      return (
        <p role="status" className="cv-question-notice">
          This question was already answered. Reload the CV to see the latest draft.
        </p>
      );
    case 'recompose-failed':
      return (
        <div>
          <p role="status" className="cv-question-error">
            Your answer is saved, but we could not update the draft. Reload the CV to see where it stands.
          </p>
          <button type="button" className="cv-button" onClick={onReload}>
            Reload the CV
          </button>
        </div>
      );
    case 'error':
      return (
        <p role="status" className="cv-question-error">
          Your answer was not saved. Try again.
        </p>
      );
    default:
      return null;
  }
}


function sameTops(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

// Desktop column. Cards stay in server order; each one is placed at its field's
// offsetTop, and pushed down only as far as needed to clear the card above it.
// Re-measured on every commit and whenever the sheet resizes.
export function QuestionColumn({
  sheetRef,
  questions,
  renderCard,
}: {
  sheetRef: { readonly current: HTMLElement | null };
  questions: CvQuestion[];
  renderCard: (q: CvQuestion, style: CSSProperties | undefined) => ReactNode;
}) {
  const columnRef = useRef<HTMLElement>(null);
  const [tops, setTops] = useState<Record<string, number>>({});
  const measureRef = useRef<() => void>(() => {});

  const measure = () => {
    const sheet = sheetRef.current;
    const column = columnRef.current;
    if (!sheet || !column) return;
    const fields = new Map<string, HTMLElement>();
    for (const el of Array.from(sheet.querySelectorAll<HTMLElement>('[data-path]'))) {
      const path = el.getAttribute('data-path');
      if (path && !fields.has(path)) fields.set(path, el);
    }
    const heights = new Map<string, number>();
    for (const el of Array.from(column.querySelectorAll<HTMLElement>('[data-question-id]'))) {
      heights.set(el.getAttribute('data-question-id') ?? '', el.offsetHeight);
    }
    const next: Record<string, number> = {};
    let cursor = 0;
    for (const q of questions) {
      const field = fields.get(q.path);
      const top = Math.max(field ? field.offsetTop : 0, cursor);
      next[q.id] = top;
      cursor = top + (heights.get(q.id) ?? 0) + CARD_GAP;
    }
    setTops((prev) => (sameTops(prev, next) ? prev : next));
  };

  useLayoutEffect(() => {
    measureRef.current = measure;
    measure();
  });

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureRef.current());
    observer.observe(sheet);
    return () => observer.disconnect();
  }, []);

  return (
    <aside ref={columnRef} className="cv-questions">
      {questions.map((q) => renderCard(q, tops[q.id] !== undefined ? { top: tops[q.id] } : undefined))}
    </aside>
  );
}
