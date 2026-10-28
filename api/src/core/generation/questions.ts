// Question planning (spec §3.5, domain-model.md Question). Pure: same input, same output.
import type { QuestionDraft } from './types.js';

// domain-model.md: at most 12 open questions at a time.
export const MAX_OPEN_QUESTIONS = 12;

export type QuestionReason = 'missing' | 'vague' | 'unverifiable';

// priority: lower is asked first. Missing employers and dates = 1, other drops = 2, vagueness = 3.
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
