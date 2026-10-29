import { useContext, useEffect, useId, useState } from 'react';
import { QuestionScopeContext } from './questions';

interface FieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  // The C-006/C-009 path this field holds, e.g. experience[1].period. A question
  // bound to the same path is shown beside (desktop) or under (mobile) this field.
  path?: string;
}

// A text field that commits on blur. The typed text stays here until then, so a
// failed or conflicting save never takes it away.
export function Field({ label, value, onCommit, multiline = false, path }: FieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const scope = useContext(QuestionScopeContext);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const common = {
    id,
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: () => {
      if (draft !== value) onCommit(draft);
    },
  };
  const marked = path !== undefined && scope !== null && scope.marked(path);
  const cards = path !== undefined && scope !== null && scope.inline ? scope.cardsFor(path) : null;
  return (
    <>
      <div className={marked ? 'cv-field cv-field-question' : 'cv-field'} data-path={path}>
        <label htmlFor={id} className="cv-field-label">
          {label}
        </label>
        {multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />}
      </div>
      {cards}
    </>
  );
}
