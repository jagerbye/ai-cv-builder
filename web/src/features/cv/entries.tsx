import type { CvBullet, CvEducation, CvExperience, CvSkill } from './types';
import { Field } from './fields';
import { TrashIcon } from './trash-icon';
import { blankBullet, blankEducation, blankExperience, blankSkill, move, remove } from './draft';

// Each list reports its whole new array; the editor decides when that is saved.

export function ExperienceList({ items, onChange }: { items: CvExperience[]; onChange: (next: CvExperience[]) => void }) {
  const set = (i: number, patch: Partial<CvExperience>) =>
    onChange(items.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  const setBullets = (i: number, bullets: CvBullet[]) => set(i, { bullets });
  return (
    <>
      {items.map((entry, i) => (
        <article key={entry.id} className="cv-entry">
          <Field label="Employer" path={`experience[${i}].employer`} value={entry.employer} onCommit={(v) => set(i, { employer: v })} />
          <Field label="Role" path={`experience[${i}].role`} value={entry.role} onCommit={(v) => set(i, { role: v })} />
          <Field label="Period" path={`experience[${i}].period`} value={entry.period} onCommit={(v) => set(i, { period: v })} />
          <Field
            label="Location"
            path={`experience[${i}].location`}
            value={entry.location ?? ''}
            onCommit={(v) => set(i, { location: v })}
          />
          <ul className="cv-bullets">
            {entry.bullets.map((bullet, j) => (
              <li key={bullet.id} className="cv-bullet">
                <Field
                  label="Bullet"
                  multiline
                  path={`experience[${i}].bullets[${j}].text`}
                  value={bullet.text}
                  onCommit={(v) =>
                    setBullets(
                      i,
                      entry.bullets.map((b, m) => (m === j ? { ...b, text: v } : b)),
                    )
                  }
                />
                <div className="cv-actions">
                  <button type="button" className="cv-button" disabled={j === 0} onClick={() => setBullets(i, move(entry.bullets, j, -1))}>
                    Move bullet up
                  </button>
                  <button
                    type="button"
                    className="cv-button"
                    disabled={j === entry.bullets.length - 1}
                    onClick={() => setBullets(i, move(entry.bullets, j, 1))}
                  >
                    Move bullet down
                  </button>
                  <button type="button" className="cv-button" onClick={() => setBullets(i, remove(entry.bullets, j))}>
                    Delete bullet
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="cv-actions">
            <button type="button" className="cv-button" onClick={() => setBullets(i, [...entry.bullets, blankBullet()])}>
              Add bullet
            </button>
            <button type="button" className="cv-button" disabled={i === 0} onClick={() => onChange(move(items, i, -1))}>
              Move up
            </button>
            <button
              type="button"
              className="cv-button"
              disabled={i === items.length - 1}
              onClick={() => onChange(move(items, i, 1))}
            >
              Move down
            </button>
            <button type="button" className="cv-button" onClick={() => onChange(remove(items, i))}>
              Delete
            </button>
          </div>
        </article>
      ))}
      <button type="button" className="cv-button" onClick={() => onChange([...items, blankExperience()])}>
        Add experience
      </button>
    </>
  );
}

export function EducationList({ items, onChange }: { items: CvEducation[]; onChange: (next: CvEducation[]) => void }) {
  const set = (i: number, patch: Partial<CvEducation>) =>
    onChange(items.map((e, k) => (k === i ? { ...e, ...patch } : e)));
  return (
    <>
      {items.map((entry, i) => (
        <article key={entry.id} className="cv-entry">
          <Field label="Institution" path={`education[${i}].institution`} value={entry.institution} onCommit={(v) => set(i, { institution: v })} />
          <Field label="Degree" path={`education[${i}].degree`} value={entry.degree ?? ''} onCommit={(v) => set(i, { degree: v })} />
          <Field label="Period" path={`education[${i}].period`} value={entry.period} onCommit={(v) => set(i, { period: v })} />
          <div className="cv-actions">
            <button type="button" className="cv-button" disabled={i === 0} onClick={() => onChange(move(items, i, -1))}>
              Move up
            </button>
            <button
              type="button"
              className="cv-button"
              disabled={i === items.length - 1}
              onClick={() => onChange(move(items, i, 1))}
            >
              Move down
            </button>
            <button type="button" className="cv-button" onClick={() => onChange(remove(items, i))}>
              Delete
            </button>
          </div>
        </article>
      ))}
      <button type="button" className="cv-button" onClick={() => onChange([...items, blankEducation()])}>
        Add education
      </button>
    </>
  );
}

// Adding a skill does not save: a blank name is not a skill yet. Naming it, moving
// or deleting saves the list.
export function SkillList({
  items,
  onAdd,
  onChange,
}: {
  items: CvSkill[];
  onAdd: (skill: CvSkill) => void;
  onChange: (next: CvSkill[]) => void;
}) {
  return (
    <>
      <ul className="cv-skills">
        {items.map((skill, i) => (
          <li key={skill.id} className="cv-skill">
            <Field
              label="Skill"
              path={`skills[${i}].name`}
              value={skill.name}
              onCommit={(v) => onChange(items.map((s, k) => (k === i ? { ...s, name: v } : s)))}
            />
            <div className="cv-actions">
              <button type="button" className="cv-button" disabled={i === 0} onClick={() => onChange(move(items, i, -1))}>
                Move up
              </button>
              <button
                type="button"
                className="cv-button"
                disabled={i === items.length - 1}
                onClick={() => onChange(move(items, i, 1))}
              >
                Move down
              </button>
              <button
                type="button"
                className="cv-button cv-icon-button"
                aria-label={`Delete skill ${skill.name || 'unnamed'}`}
                onClick={() => onChange(remove(items, i))}
              >
                <TrashIcon />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="cv-button" onClick={() => onAdd(blankSkill())}>
        Add skill
      </button>
    </>
  );
}
