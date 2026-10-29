// T-13 (CVB-13) — intake screen, spec §3.2 (F-002), contracts C-003 and C-004.
import { useId, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import './intake.css';
import { INTAKE_LIMITS, pdfProblem, roleProblem, textProblem } from './validate';
import { createFromPdf, createFromText, openProgress, type CreatedCv } from './submit';

type Mode = 'text' | 'pdf';

interface Problem {
  message: string;
  details: string[];
}

const NARROW_QUERY = '(max-width: 899px)';
const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

// Typing beats uploading on a phone, so free text is the default there.
function startsNarrow(): boolean {
  try {
    return window.matchMedia(NARROW_QUERY).matches;
  } catch {
    return false;
  }
}

function problemFrom(err: unknown): Problem {
  if (err instanceof ApiError) {
    return { message: err.message, details: (err.details ?? []).map((d) => d.message) };
  }
  return { message: GENERIC_MESSAGE, details: [] };
}

const plain = (message: string): Problem => ({ message, details: [] });

export default function IntakeRoute() {
  const ids = useId();
  const [mode, setMode] = useState<Mode>(() => (startsNarrow() ? 'text' : 'pdf'));
  const [sourceText, setSourceText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [targetRole, setTargetRole] = useState('');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [pending, setPending] = useState(false);

  const tabId = (m: Mode) => `${ids}-tab-${m}`;
  const panelId = `${ids}-panel`;
  const roleHintId = `${ids}-role-hint`;
  const textHintId = `${ids}-text-hint`;
  const fileHintId = `${ids}-file-hint`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const role = targetRole.trim();
    const issues = [mode === 'text' ? textProblem(sourceText) : pdfProblem(file), roleProblem(role)];
    const found = issues.filter((m): m is string => m !== null).map(plain);
    if (found.length > 0) {
      setProblems(found);
      return;
    }

    setProblems([]);
    setPending(true);
    try {
      const created: CreatedCv =
        mode === 'text' ? await createFromText(sourceText, role) : await createFromPdf(file as File, role);
      openProgress(created);
    } catch (err) {
      setProblems([problemFrom(err)]);
      setPending(false);
    }
  }

  const count = sourceText.length.toLocaleString('en-US');

  return (
    <section className="page intake" aria-labelledby={`${ids}-heading`}>
      <h1 id={`${ids}-heading`} className="intake-heading">
        Create your CV
      </h1>
      <p className="intake-lead">
        Share your experience as text or as an existing PDF, then name the role you are aiming for.
      </p>

      <form className="intake-form" onSubmit={onSubmit} noValidate>
        <div className="intake-tabs" role="tablist" aria-label="How to add your experience">
          <button
            type="button"
            role="tab"
            id={tabId('text')}
            aria-selected={mode === 'text'}
            aria-controls={panelId}
            className="intake-tab"
            onClick={() => setMode('text')}
          >
            Paste text
          </button>
          <button
            type="button"
            role="tab"
            id={tabId('pdf')}
            aria-selected={mode === 'pdf'}
            aria-controls={panelId}
            className="intake-tab"
            onClick={() => setMode('pdf')}
          >
            Upload PDF
          </button>
        </div>

        <div role="tabpanel" id={panelId} aria-labelledby={tabId(mode)} className="intake-panel">
          {mode === 'text' ? (
            <div className="intake-field">
              <label htmlFor={`${ids}-text`} className="intake-label">
                Paste your CV text
              </label>
              <p id={textHintId} className="intake-hint">
                Roles, projects and results, in your own words. Between {INTAKE_LIMITS.textMin} and{' '}
                {INTAKE_LIMITS.textMax.toLocaleString('en-US')} characters.
              </p>
              <textarea
                id={`${ids}-text`}
                className="intake-textarea"
                rows={12}
                value={sourceText}
                aria-describedby={`${textHintId} ${ids}-text-count`}
                onChange={(e) => setSourceText(e.target.value)}
              />
              <p id={`${ids}-text-count`} className="intake-hint">
                {count} characters
              </p>
            </div>
          ) : (
            <div className="intake-field">
              <label htmlFor={`${ids}-file`} className="intake-label">
                PDF file
              </label>
              <p id={fileHintId} className="intake-hint">
                Up to 10 MB and 20 pages. A scanned PDF with no text layer cannot be read, so paste the text
                instead.
              </p>
              <div className="file-picker">
                <input
                  id={`${ids}-file`}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="file-picker-input"
                  aria-describedby={fileHintId}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <label htmlFor={`${ids}-file`} className="file-picker-button">
                  Choose file
                </label>
                <span className="file-picker-name">{file ? file.name : 'No file chosen'}</span>
              </div>
            </div>
          )}
        </div>

        <div className="intake-field">
          <label htmlFor={`${ids}-role`} className="intake-label">
            Target role
          </label>
          <p id={roleHintId} className="intake-hint">
            The job you are applying for, for example "Staff engineer". Up to {INTAKE_LIMITS.roleMax} characters.
          </p>
          <input
            id={`${ids}-role`}
            type="text"
            className="intake-input"
            autoComplete="off"
            value={targetRole}
            aria-required="true"
            aria-describedby={roleHintId}
            onChange={(e) => setTargetRole(e.target.value)}
          />
        </div>

        {problems.map((problem, i) => (
          <div key={i} role="alert" className="intake-alert">
            <p className="intake-alert-message">{problem.message}</p>
            {problem.details.length > 0 && (
              <ul className="intake-alert-details">
                {problem.details.map((d, j) => (
                  <li key={j}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <button type="submit" className="intake-submit" disabled={pending} aria-busy={pending}>
          Generate CV
        </button>
      </form>
    </section>
  );
}
