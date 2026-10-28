import { describe, it, expect } from 'vitest';
import { mergeRegenerated } from './merge.js';

// T-18 (CVB-16), spec.md F-006 §3.6 and domain-model CvItem invariant:
// "userEdited=true items are never overwritten by generation or by answering a
// question; they are preserved verbatim across a regenerate."
// Regeneration is simulated here as a pure merge of the stored items with a
// freshly generated item set. Items are matched by `path` (cv_items has a
// unique (cvId, path)). The answer-question path is covered by T-20 (C-009).

interface Item {
  id: string;
  kind: string;
  parentId?: string;
  path: string;
  orderIndex: number;
  data: Record<string, unknown>;
  factIds: string[];
  userEdited: boolean;
}

const stored: Item[] = [
  { id: 's', kind: 'summary', path: 'summary', orderIndex: 0, data: { text: 'Hand-written summary' }, factIds: [], userEdited: true },
  { id: 'e0', kind: 'experience', path: 'experience[0]', orderIndex: 0, data: { employer: 'Babbage Works', role: 'Lead Engineer' }, factIds: ['f1'], userEdited: true },
  { id: 'b0', kind: 'bullet', parentId: 'e0', path: 'experience[0].bullets[0]', orderIndex: 0, data: { text: 'Led a team of six' }, factIds: [], userEdited: true },
  { id: 'e1', kind: 'experience', path: 'experience[1]', orderIndex: 1, data: { employer: 'Analytical Engines' }, factIds: ['f2'], userEdited: false },
  { id: 'k0', kind: 'skill', path: 'skills[0]', orderIndex: 0, data: { name: 'TypeScript' }, factIds: ['f3'], userEdited: false },
];

const generated: Item[] = [
  { id: 'g-s', kind: 'summary', path: 'summary', orderIndex: 0, data: { text: 'Generated summary' }, factIds: ['f9'], userEdited: false },
  { id: 'g-e0', kind: 'experience', path: 'experience[0]', orderIndex: 0, data: { employer: 'Babbage Works (generated)', role: 'Engineer' }, factIds: ['f1'], userEdited: false },
  { id: 'g-b0', kind: 'bullet', parentId: 'g-e0', path: 'experience[0].bullets[0]', orderIndex: 0, data: { text: 'Cut build time by 40%' }, factIds: ['f4'], userEdited: false },
  { id: 'g-b1', kind: 'bullet', parentId: 'g-e0', path: 'experience[0].bullets[1]', orderIndex: 1, data: { text: 'Shipped CI for 12 repos' }, factIds: ['f5'], userEdited: false },
  { id: 'g-e1', kind: 'experience', path: 'experience[1]', orderIndex: 1, data: { employer: 'Analytical Engines (generated)' }, factIds: ['f2'], userEdited: false },
  { id: 'g-k0', kind: 'skill', path: 'skills[0]', orderIndex: 0, data: { name: 'Go' }, factIds: ['f6'], userEdited: false },
];

function byPath(items: Item[], path: string): Item | undefined {
  return items.find((i) => i.path === path);
}

describe('mergeRegenerated — user edits survive a regeneration (CvItem invariant)', () => {
  it('keeps a userEdited summary verbatim and drops the generated summary', () => {
    const result = mergeRegenerated(stored, generated);
    expect(byPath(result, 'summary')).toEqual(stored[0]);
    expect(result.some((i) => i.data.text === 'Generated summary')).toBe(false);
  });

  it('keeps a userEdited experience entry and its userEdited bullet over generated values at the same paths', () => {
    const result = mergeRegenerated(stored, generated);
    expect(byPath(result, 'experience[0]')).toEqual(stored[1]);
    expect(byPath(result, 'experience[0].bullets[0]')).toEqual(stored[2]);
    expect(result.some((i) => i.data.text === 'Cut build time by 40%')).toBe(false);
  });

  it('replaces non-edited items with the regenerated values', () => {
    const result = mergeRegenerated(stored, generated);
    expect(byPath(result, 'experience[1]')?.data).toEqual({ employer: 'Analytical Engines (generated)' });
    expect(byPath(result, 'skills[0]')?.data).toEqual({ name: 'Go' });
    expect(byPath(result, 'skills[0]')?.userEdited).toBe(false);
  });

  it('adds generated items on paths that no user edit occupies', () => {
    const result = mergeRegenerated(stored, generated);
    expect(byPath(result, 'experience[0].bullets[1]')?.data).toEqual({ text: 'Shipped CI for 12 repos' });
  });

  it('keeps every userEdited item when the regeneration produces nothing', () => {
    const result = mergeRegenerated(stored, []);
    const edited = stored.filter((i) => i.userEdited);
    for (const item of edited) {
      expect(result.find((i) => i.id === item.id)).toEqual(item);
    }
  });

  it('keeps user edits across two consecutive simulated regenerations with different output', () => {
    const second: Item[] = [
      { id: 'h-s', kind: 'summary', path: 'summary', orderIndex: 0, data: { text: 'Second run summary' }, factIds: ['f10'], userEdited: false },
      { id: 'h-b0', kind: 'bullet', parentId: 'h-e0', path: 'experience[0].bullets[0]', orderIndex: 0, data: { text: 'Different bullet' }, factIds: ['f11'], userEdited: false },
    ];
    const once = mergeRegenerated(stored, generated);
    const twice = mergeRegenerated(once, second);
    expect(byPath(twice, 'summary')).toEqual(stored[0]);
    expect(byPath(twice, 'experience[0].bullets[0]')).toEqual(stored[2]);
    expect(twice.some((i) => i.data.text === 'Second run summary')).toBe(false);
    expect(twice.some((i) => i.data.text === 'Different bullet')).toBe(false);
  });
});
