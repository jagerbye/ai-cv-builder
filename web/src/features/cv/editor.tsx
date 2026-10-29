import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ApiError, GENERIC_MESSAGE, apiFetch } from '../../api/client';
import { Field } from './fields';
import { EducationList, ExperienceList, SkillList } from './entries';
import { toDraft, toWire } from './draft';
import {
  QuestionCard,
  QuestionColumn,
  QuestionScopeContext,
  fieldPathsOf,
  sectionOf,
  useTwoColumn,
  type AnswerKind,
  type QuestionScope,
} from './questions';
import type { CvDraft, CvDto, CvPatch, CvQuestion, Section } from './types';

interface SectionError {
  messages: string[];
  retry: boolean;
}

// Saves go out one at a time, each with the version the previous save returned
// (C-008). After a 409 nothing else is sent: the user decides to reload.
export function CvEditor({ cv, onReload }: { cv: CvDto; onReload: () => void }) {
  const [draft, setDraft] = useState<CvDraft>(() => toDraft(cv));
  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Section, SectionError>>>({});
  const [questions, setQuestions] = useState<CvQuestion[]>(cv.questions);
  const [answers, setAnswers] = useState<Record<string, AnswerKind>>({});
  const [skipped, setSkipped] = useState<Record<string, true>>({});
  const versionRef = useRef(cv.version);
  const blockedRef = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const answering = useRef(new Set<string>());
  const sheetRef = useRef<HTMLDivElement>(null);
  const twoColumn = useTwoColumn();

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(timer);
  }, [saved]);

  async function send(section: Section, value: CvDraft[Section]) {
    if (blockedRef.current) return;
    setErrors((e) => {
      const next = { ...e };
      delete next[section];
      return next;
    });
    const patch = { [section]: value } as CvPatch;
    try {
      const next = await apiFetch<CvDto>(`/cvs/${cv.id}`, {
        method: 'PATCH',
        body: { version: versionRef.current, patch },
      });
      versionRef.current = next.version;
      setSaved(true);
    } catch (err) {
      setSaved(false);
      if (err instanceof ApiError && err.code === 'VERSION_CONFLICT') {
        blockedRef.current = true;
        setConflict(true);
        return;
      }
      setErrors((e) => ({ ...e, [section]: toSectionError(err) }));
    }
  }

  // Queued on the save chain, so it runs after any save already in flight and before
  // any save the user makes next. It only takes the version: the answer's section did
  // not change when the recompose failed.
  function resyncVersion() {
    chain.current = chain.current
      .then(async () => {
        const fresh = await apiFetch<CvDto>(`/cvs/${cv.id}`);
        versionRef.current = fresh.version;
      })
      .catch(() => undefined);
  }

  function enqueue(section: Section, value: CvDraft[Section]) {
    setPending((n) => n + 1);
    chain.current = chain.current.then(() => send(section, value)).finally(() => setPending((n) => n - 1));
  }

  function commit<K extends Section>(section: K, value: CvDraft[K]) {
    setDraft((d) => ({ ...d, [section]: value }) as CvDraft);
    enqueue(section, toWire(section, value) as CvDraft[Section]);
  }

  // C-009. The answer is posted to the question, never PATCHed. On success only the
  // section the question's path belongs to takes the server's copy; every other
  // section, and every userEdited field, keeps its node and its value.
  async function answerQuestion(q: CvQuestion, text: string) {
    if (answering.current.has(q.id)) return;
    answering.current.add(q.id);
    setAnswers((a) => ({ ...a, [q.id]: 'busy' }));
    try {
      const next = await apiFetch<CvDto>(`/cvs/${cv.id}/questions/${q.id}/answer`, {
        method: 'POST',
        body: { answer: text },
      });
      versionRef.current = next.version;
      setQuestions(next.questions);
      const section = sectionOf(q.path);
      if (section) setDraft((d) => ({ ...d, [section]: toDraft(next)[section] }) as CvDraft);
      setAnswers((a) => ({ ...a, [q.id]: 'answered' }));
    } catch (err) {
      const kind: AnswerKind =
        err instanceof ApiError && err.status === 409
          ? 'conflict'
          : err instanceof ApiError && err.status === 503
            ? 'recompose-failed'
            : 'error';
      // A 503 is still a stored answer, and the server bumped the version before it
      // recomposed (ADR-015). The 503 body carries no CV, so re-read it to take the
      // new version. Without this every later PATCH is stale and reports a conflict.
      if (kind === 'recompose-failed') resyncVersion();
      setAnswers((a) => ({ ...a, [q.id]: kind }));
    } finally {
      answering.current.delete(q.id);
    }
  }

  function finishAnswer(id: string) {
    setAnswers((a) => {
      const next = { ...a };
      delete next[id];
      return next;
    });
  }

  const setContact = (patch: Partial<CvDraft['contact']>) => commit('contact', { ...draft.contact, ...patch });
  const retry = (section: Section) => enqueue(section, toWire(section, draft[section]) as CvDraft[Section]);
  const status = pending > 0 ? 'Saving…' : saved ? 'Saved' : '';

  // A question stays while it is open, and while its answer is on screen.
  const visible = questions.filter((q) => !skipped[q.id] && (q.status === 'open' || answers[q.id] !== undefined));
  const placed = fieldPathsOf(draft);
  const openPaths = new Set(visible.map((q) => q.path));
  const renderCard = (q: CvQuestion, style?: CSSProperties) => (
    <QuestionCard
      key={q.id}
      question={q}
      kind={answers[q.id]}
      style={style}
      onAnswer={(text) => void answerQuestion(q, text)}
      onDone={() => finishAnswer(q.id)}
      onSkip={() => setSkipped((s) => ({ ...s, [q.id]: true }))}
      onReload={onReload}
    />
  );
  const scope: QuestionScope = {
    inline: !twoColumn,
    marked: (path) => openPaths.has(path),
    cardsFor: (path) => visible.filter((q) => q.path === path).map((q) => renderCard(q)),
  };
  // Narrow screens put each card under its field. A question whose path has no
  // field on the page is still shown, after the sheet, rather than dropped.
  const loose = twoColumn ? [] : visible.filter((q) => !placed.has(q.path));

  return (
    <QuestionScopeContext.Provider value={scope}>
      <div className="cv-page">
        <header className="cv-header">
          <h1 className="cv-title">{cv.title}</h1>
          <p className="cv-target">{cv.targetRole}</p>
          <p role="status" className="cv-status">
            {status}
          </p>
        </header>
        {cv.state === 'failed' && <FailedBanner cv={cv} />}
        {conflict && (
          <div role="alert" className="cv-callout">
            <p>
              This CV was changed on another device. Your edits are still shown below; Reload latest replaces them with
              the saved version.
            </p>
            <button type="button" className="cv-button" onClick={onReload}>
              Reload latest
            </button>
          </div>
        )}
        <div className="cv-layout">
          <div className="cv-sheet" ref={sheetRef}>
            <section className="cv-section" aria-labelledby="cv-section-contact">
              <h2 id="cv-section-contact" className="cv-eyebrow">
                Contact
              </h2>
              <Field label="Full name" path="contact.fullName" value={draft.contact.fullName ?? ''} onCommit={(v) => setContact({ fullName: v })} />
              <Field label="Email" path="contact.email" value={draft.contact.email ?? ''} onCommit={(v) => setContact({ email: v })} />
              <Field label="Phone" path="contact.phone" value={draft.contact.phone ?? ''} onCommit={(v) => setContact({ phone: v })} />
              <Field
                label="Location"
                path="contact.location"
                value={draft.contact.location ?? ''}
                onCommit={(v) => setContact({ location: v })}
              />
              <Field
                label="Links"
                multiline
                path="contact.links"
                value={draft.contact.links.join('\n')}
                onCommit={(v) =>
                  setContact({
                    links: v
                      .split('\n')
                      .map((line) => line.trim())
                      .filter((line) => line !== ''),
                  })
                }
              />
              <SectionFooter error={errors.contact} onRetry={() => retry('contact')} />
            </section>

            <section className="cv-section" aria-labelledby="cv-section-summary">
              <h2 id="cv-section-summary" className="cv-eyebrow">
                Summary
              </h2>
              <Field
                label="Summary"
                multiline
                path="summary.text"
                value={draft.summary?.text ?? ''}
                onCommit={(v) => commit('summary', { ...(draft.summary ?? { factIds: [], userEdited: false }), text: v })}
              />
              <SectionFooter error={errors.summary} onRetry={() => retry('summary')} />
            </section>

            <section className="cv-section" aria-labelledby="cv-section-experience">
              <h2 id="cv-section-experience" className="cv-eyebrow">
                Experience
              </h2>
              <ExperienceList items={draft.experience} onChange={(next) => commit('experience', next)} />
              <SectionFooter error={errors.experience} onRetry={() => retry('experience')} />
            </section>

            <section className="cv-section" aria-labelledby="cv-section-education">
              <h2 id="cv-section-education" className="cv-eyebrow">
                Education
              </h2>
              <EducationList items={draft.education} onChange={(next) => commit('education', next)} />
              <SectionFooter error={errors.education} onRetry={() => retry('education')} />
            </section>

            <section className="cv-section" aria-labelledby="cv-section-skills">
              <h2 id="cv-section-skills" className="cv-eyebrow">
                Skills
              </h2>
              <SkillList
                items={draft.skills}
                onAdd={(skill) => setDraft((d) => ({ ...d, skills: [...d.skills, skill] }))}
                onChange={(next) => commit('skills', next)}
              />
              <SectionFooter error={errors.skills} onRetry={() => retry('skills')} />
            </section>
          </div>
          {twoColumn && <QuestionColumn sheetRef={sheetRef} questions={visible} renderCard={renderCard} />}
        </div>
        {loose.length > 0 && <div className="cv-questions-loose">{loose.map((q) => renderCard(q))}</div>}
      </div>
    </QuestionScopeContext.Provider>
  );
}

function toSectionError(err: unknown): SectionError {
  if (err instanceof ApiError && err.code === 'VALIDATION') {
    const messages = (err.details ?? []).map((d) => d.message);
    return { messages: messages.length > 0 ? messages : [err.message], retry: false };
  }
  if (err instanceof ApiError && err.code !== 'INTERNAL') {
    return { messages: [err.message], retry: true };
  }
  return { messages: [GENERIC_MESSAGE], retry: true };
}

function SectionFooter({ error, onRetry }: { error: SectionError | undefined; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div className="cv-error">
      {error.messages.map((m) => (
        <p key={m}>{m}</p>
      ))}
      {error.retry && (
        <button type="button" className="cv-button" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

// C-006, ADR-017: the server's own message for why generation failed, and the
// retry the user has, which is regenerate (C-010). The message is shown as sent,
// whatever the code, so a code this client has never seen still reads truthfully.
function FailedBanner({ cv }: { cv: CvDto }) {
  const regenerate = useMutation({
    mutationFn: () => apiFetch<{ jobId: string }>(`/cvs/${encodeURIComponent(cv.id)}/regenerate`, { method: 'POST' }),
    onSuccess: (r) => window.location.assign(`/jobs/${encodeURIComponent(r.jobId)}`),
  });
  const reason = cv.lastError?.message ?? GENERIC_MESSAGE;
  return (
    <div role="alert" className="cv-callout">
      <p>Generation failed. {reason}</p>
      <button type="button" className="cv-button" onClick={() => regenerate.mutate()} disabled={regenerate.isPending}>
        Regenerate
      </button>
      {regenerate.isError && (
        <p>{regenerate.error instanceof ApiError ? regenerate.error.message : GENERIC_MESSAGE}</p>
      )}
    </div>
  );
}
