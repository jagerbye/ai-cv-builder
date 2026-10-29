// Question planning (spec §3.5, domain-model.md Question). Pure: same input, same output.
import type { QuestionDraft } from './types.js';

// domain-model.md: at most 12 open questions at a time.
export const MAX_OPEN_QUESTIONS = 12;

export type QuestionReason = 'missing' | 'vague' | 'unverifiable';

// ADR-026: what ignoring the question costs the user. The ONE table a priority comes from (lower is asked first).
//   missing     content is gone from the CV (a dropped entry, education, skill or contact field)        -> 1
//   unsupported content is in the CV but the source does not back it (flagged prose, an unstated period) -> 2
//   vague       content is in the CV and vague                                                            -> 3
// This is independent of `reason`, which stays what each path says it is (a kept uncited bullet is reason
// 'missing' yet unsupported content: its text is still in the CV).
export type QuestionImpact = 'missing' | 'unsupported' | 'vague';
const PRIORITY_BY_IMPACT: Record<QuestionImpact, number> = { missing: 1, unsupported: 2, vague: 3 };
export const priorityFor = (impact: QuestionImpact): number => PRIORITY_BY_IMPACT[impact];

// priority: lower is asked first, derived by priorityFor (ADR-026).
export interface PlannedQuestion extends QuestionDraft {
  reason: QuestionReason;
  priority: number;
  followUpOf?: string;
}

// Stable sort by priority (ties keep candidate order), then the cap.
export function planQuestions(candidates: readonly PlannedQuestion[]): PlannedQuestion[] {
  return [...candidates].sort((a, b) => a.priority - b.priority).slice(0, MAX_OPEN_QUESTIONS);
}

// One follow-up per original path; a follow-up is never followed up. Null when none is allowed.
export function followUpFor(
  original: PlannedQuestion,
  history: readonly PlannedQuestion[],
  text: string,
): PlannedQuestion | null {
  if (original.followUpOf !== undefined) return null;
  if (history.some((h) => h.followUpOf === original.path)) return null;
  return {
    path: original.path,
    text,
    reason: original.reason,
    priority: original.priority,
    followUpOf: original.path,
  };
}
