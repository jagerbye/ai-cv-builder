// B-022 / F-004 — "where did this line come from". A text button under a generated
// line opens its sources in place, the same way a question card sits under its field
// on a phone: one mechanism at every width, no popover, no icon, no amber.
import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { CvFact } from './types';

export interface Citation {
  factIds: string[];
  userEdited: boolean;
}

export const FactsContext = createContext<CvFact[]>([]);

export function SourceNote({ citation }: { citation: Citation }) {
  const facts = useContext(FactsContext);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    setOpen(!open);
  };
  // Focus goes into the panel so Escape is heard from where the reader is.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);
  const close = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  };

  const cited = citation.factIds
    .map((id) => facts.find((f) => f.id === id))
    .filter((f): f is CvFact => f !== undefined);

  let body;
  if (citation.userEdited) {
    body = <p className="cv-source-note">This line is your own wording, not taken from the document.</p>;
  } else if (citation.factIds.length === 0) {
    body = <p className="cv-source-note">No source cited for this line.</p>;
  } else if (cited.length === 0) {
    body = <p className="cv-source-note">The cited source is no longer available.</p>;
  } else {
    body = (
      <ul className="cv-source-list">
        {cited.map((f) => (
          <li key={f.id} className="cv-source-fact">
            <p className="cv-source-origin">{f.source === 'user' ? 'From your answer' : 'From your document'}</p>
            <blockquote className="cv-source-quote">{f.sourceQuote !== '' ? f.sourceQuote : f.text}</blockquote>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="cv-source">
      <button
        ref={buttonRef}
        type="button"
        className="cv-button cv-source-toggle"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        {open ? 'Hide source' : 'Show source'}
      </button>
      {open && (
        <div
          id={panelId}
          ref={panelRef}
          role="region"
          aria-label="Source of this line"
          tabIndex={-1}
          className="cv-source-panel"
          onKeyDown={close}
        >
          {body}
        </div>
      )}
    </div>
  );
}
