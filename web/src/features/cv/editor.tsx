import { useEffect, useRef, useState } from 'react';
import { ApiError, GENERIC_MESSAGE, apiFetch } from '../../api/client';
import { Field } from './fields';
import { EducationList, ExperienceList, SkillList } from './entries';
import { toDraft, toWire } from './draft';
import type { CvDraft, CvDto, CvPatch, Section } from './types';

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
  const versionRef = useRef(cv.version);
  const blockedRef = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());

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

  function enqueue(section: Section, value: CvDraft[Section]) {
    setPending((n) => n + 1);
    chain.current = chain.current.then(() => send(section, value)).finally(() => setPending((n) => n - 1));
  }

  function commit<K extends Section>(section: K, value: CvDraft[K]) {
    setDraft((d) => ({ ...d, [section]: value }) as CvDraft);
    enqueue(section, toWire(section, value) as CvDraft[Section]);
  }

  const setContact = (patch: Partial<CvDraft['contact']>) => commit('contact', { ...draft.contact, ...patch });
  const retry = (section: Section) => enqueue(section, toWire(section, draft[section]) as CvDraft[Section]);
  const status = pending > 0 ? 'Saving…' : saved ? 'Saved' : '';

  return (
    <div className="cv-page">
      <header className="cv-header">
        <h1 className="cv-title">{cv.title}</h1>
        <p className="cv-target">{cv.targetRole}</p>
        <p role="status" className="cv-status">
          {status}
        </p>
      </header>
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
      <div className="cv-sheet">
        <section className="cv-section" aria-labelledby="cv-section-contact">
          <h2 id="cv-section-contact" className="cv-eyebrow">
            Contact
          </h2>
          <Field label="Full name" value={draft.contact.fullName ?? ''} onCommit={(v) => setContact({ fullName: v })} />
          <Field label="Email" value={draft.contact.email ?? ''} onCommit={(v) => setContact({ email: v })} />
          <Field label="Phone" value={draft.contact.phone ?? ''} onCommit={(v) => setContact({ phone: v })} />
          <Field label="Location" value={draft.contact.location ?? ''} onCommit={(v) => setContact({ location: v })} />
          <Field
            label="Links"
            multiline
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
    </div>
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
