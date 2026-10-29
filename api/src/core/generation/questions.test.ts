import { describe, it, expect } from 'vitest';
import { planQuestions, followUpFor, priorityFor, MAX_OPEN_QUESTIONS } from './questions.js';
import type { PlannedQuestion } from './questions.js';

// T-12 (CVB-12). questions.ts: ordering, cap and follow-up rule (spec §3.5 F-005,
// domain-model.md Question). Contract these tests pin:
//   PlannedQuestion = QuestionDraft & { reason: 'missing'|'vague'|'unverifiable';
//                                       priority: number /* lower = asked first */;
//                                       followUpOf?: string /* path of the question followed up */ }
//   planQuestions(candidates) -> stable sort by priority, capped at MAX_OPEN_QUESTIONS (12)
//   followUpFor(original, history, text) -> one follow-up on the same path, or null

const q = (path: string, reason: PlannedQuestion['reason'], priority: number, followUpOf?: string): PlannedQuestion => ({
  path,
  text: `Question about ${path}`,
  reason,
  priority,
  ...(followUpOf !== undefined ? { followUpOf } : {}),
});

describe('planQuestions — ordering (spec §3.5: missing before vague)', () => {
  it('sorts by priority ascending and keeps input order for ties', () => {
    const input = [
      q('a', 'vague', 3),
      q('b', 'missing', 1),
      q('c', 'unverifiable', 2),
      q('d', 'missing', 1),
    ];
    expect(planQuestions(input).map((x) => x.path)).toEqual(['b', 'd', 'c', 'a']);
  });

  it('does not mutate the candidate array', () => {
    const input = [q('a', 'vague', 3), q('b', 'missing', 1)];
    planQuestions(input);
    expect(input.map((x) => x.path)).toEqual(['a', 'b']);
  });

  it('returns an empty list for no candidates', () => {
    expect(planQuestions([])).toEqual([]);
  });
});

describe('planQuestions — cap of 12 open questions (domain-model Question invariant)', () => {
  it('declares the cap as 12', () => {
    expect(MAX_OPEN_QUESTIONS).toBe(12);
  });

  it('keeps all 12 when there are exactly 12 (no off-by-one)', () => {
    const input = Array.from({ length: 12 }, (_, i) => q(`p${i}`, 'unverifiable', 2));
    expect(planQuestions(input)).toHaveLength(12);
  });

  it('caps 15 candidates at 12 and drops the least urgent ones', () => {
    const urgent = Array.from({ length: 12 }, (_, i) => q(`missing${i}`, 'missing', 1));
    const vague = Array.from({ length: 3 }, (_, i) => q(`vague${i}`, 'vague', 3));
    const result = planQuestions([...vague, ...urgent]);
    expect(result).toHaveLength(12);
    expect(result.every((x) => x.reason === 'missing')).toBe(true);
  });

  it('keeps a missing employer question over an excess of unverifiable ones', () => {
    const unverifiable = Array.from({ length: 13 }, (_, i) => q(`skills[${i}]`, 'unverifiable', 2));
    const result = planQuestions([...unverifiable, q('experience[0].employer', 'missing', 1)]);
    expect(result).toHaveLength(12);
    expect(result[0].path).toBe('experience[0].employer');
  });
});

describe('followUpFor — at most one follow-up per path (F-005)', () => {
  const original = q('experience[0].period', 'missing', 1);

  it('raises one follow-up bound to the same path after an unresolved answer', () => {
    const fu = followUpFor(original, [original], 'Which years exactly?');
    expect(fu).toEqual({
      path: 'experience[0].period',
      text: 'Which years exactly?',
      reason: 'missing',
      priority: 1,
      followUpOf: 'experience[0].period',
    });
  });

  it('returns null once the path already has its one follow-up', () => {
    const fu = followUpFor(original, [original], 'Which years exactly?') as PlannedQuestion;
    expect(followUpFor(original, [original, fu], 'Still which years?')).toBeNull();
  });

  it('never follows up a follow-up (chain length is at most 1)', () => {
    const fu = q('experience[0].period', 'missing', 1, 'experience[0].period');
    expect(followUpFor(fu, [original, fu], 'Third try?')).toBeNull();
  });

  it('does not block a follow-up on a different path', () => {
    const fu = q('experience[0].period', 'missing', 1, 'experience[0].period');
    const other = q('experience[1].period', 'missing', 1);
    const next = followUpFor(other, [original, fu, other], 'Which years for the second job?');
    expect(next).not.toBeNull();
    expect(next?.path).toBe('experience[1].period');
  });
});

describe('priorityFor (ADR-026): what ignoring the question costs', () => {
  it('maps missing content to 1, unsupported content to 2, vague content to 3', () => {
    expect([priorityFor('missing'), priorityFor('unsupported'), priorityFor('vague')]).toEqual([1, 2, 3]);
  });
});
