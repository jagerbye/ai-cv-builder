import { useEffect, useId, useState } from 'react';

interface FieldProps {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
}

// A text field that commits on blur. The typed text stays here until then, so a
// failed or conflicting save never takes it away.
export function Field({ label, value, onCommit, multiline = false }: FieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
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
  return (
    <div className="cv-field">
      <label htmlFor={id} className="cv-field-label">
        {label}
      </label>
      {multiline ? <textarea rows={2} {...common} /> : <input type="text" {...common} />}
    </div>
  );
}
