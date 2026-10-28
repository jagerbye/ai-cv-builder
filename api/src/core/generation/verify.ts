// verify(draft, facts): the groundedness gate (spec §3.4, ADR-002). Pure and deterministic:
// no LLM, no clock, no randomness. Drafts and facts are never mutated.
import type { CvDraft, DroppedItem, Fact, VerificationResult } from './types.js';
import { planQuestions, type PlannedQuestion, type QuestionReason } from './questions.js';
import { containsPeriod, containsText, unsupportedEntity } from './verify-entities.js';

interface Failure {
  reason: Exclude<QuestionReason, 'vague'>;
  detail: string;
}

// Citation rule: every item cites facts; each cited id must exist; the item's entities must occur in them.
function checkCited(text: string, factIds: string[], byId: Map<string, Fact>): Failure | null {
  if (factIds.length === 0) return { reason: 'missing', detail: 'no cited factIds' };
  const unknown = factIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) return { reason: 'unverifiable', detail: `unknown factIds: ${unknown.join(', ')}` };
  const entity = unsupportedEntity(text, factIds.map((id) => byId.get(id)!.text));
  if (entity !== null) return { reason: 'unverifiable', detail: `${entity} not in cited facts` };
  return null;
}

function questionText(path: string, reason: QuestionReason): string {
  if (path.endsWith('.employer')) return 'Which employer did this role happen at? The drafted name is not in the cited source.';
  if (path.endsWith('.period')) return 'What were the exact dates of this role? The drafted dates are not in the cited source.';
  if (path.endsWith('.role')) return 'Which job title did you hold? The drafted title is not in the cited source.';
  if (reason === 'missing') return 'Which source fact supports this item? It cites none.';
  return 'Which source fact supports this item? The drafted text is not confirmed by the cited source.';
}

// questions carry reason and priority (PlannedQuestion), a narrowing of the frozen QuestionDraft[].
export interface PlannedVerification extends VerificationResult {
  questions: PlannedQuestion[];
}

export function verify(draft: CvDraft, facts: readonly Fact[]): PlannedVerification {
  const byId = new Map(facts.map((f) => [f.id, f] as const));
  const dropped: DroppedItem[] = [];
  const candidates: PlannedQuestion[] = [];
  const allText = facts.map((f) => f.text).join('\n');

  // Missing and unverifiable drops are priority 2; employer and period drops are priority 1 (see below).
  const checkItem = (path: string, text: string, factIds: string[]): boolean => {
    const f = checkCited(text, factIds, byId);
    if (f === null) return true;
    dropped.push({ path, reason: f.detail });
    candidates.push({ path, text: questionText(path, f.reason), reason: f.reason, priority: 2 });
    return false;
  };

  const accepted: CvDraft = {
    targetRole: draft.targetRole,
    experience: [],
    education: [],
    skills: [],
  };

  // Education has no citation either: institution and period must occur in some fact, else drop (priority 1).
  draft.education.forEach((edu, i) => {
    const p = `education[${i}]`;
    const fails: { path: string; detail: string }[] = [];
    if (!containsText(allText, edu.institution)) {
      fails.push({ path: `${p}.institution`, detail: `institution "${edu.institution}" not in facts` });
    }
    if (!containsPeriod(allText, edu.period)) {
      fails.push({ path: `${p}.period`, detail: `period "${edu.period}" not in facts` });
    }
    if (fails.length === 0) {
      accepted.education.push({ ...edu });
      return;
    }
    dropped.push({ path: p, reason: fails.map((f) => f.detail).join('; ') });
    for (const f of fails) {
      const text = f.path.endsWith('.institution')
        ? 'Which school or university did you attend? The drafted name is not in the source.'
        : 'What were the dates of this education? The drafted dates are not in the source.';
      candidates.push({ path: f.path, text, reason: 'missing', priority: 1 });
    }
  });

  if (draft.summary !== undefined && checkItem('summary', draft.summary.text, draft.summary.factIds)) {
    accepted.summary = { text: draft.summary.text, factIds: [...draft.summary.factIds] };
  }

  draft.experience.forEach((entry, i) => {
    const p = `experience[${i}]`;
    // CvDraft gives entries no factIds of their own (types.ts, T-07), so employer and period are
    // grounded against the whole fact list: they must occur in some extracted fact. An invented
    // employer or date occurs in none and is dropped. See ADR-002 amendment A for the mis-pairing limit.
    const citedText = allText;

    // Employer and period are the entry's own facts: missing either drops the whole entry (priority 1).
    const entryFailures: { path: string; detail: string }[] = [];
    if (!containsText(citedText, entry.employer)) {
      entryFailures.push({ path: `${p}.employer`, detail: `employer "${entry.employer}" not in facts` });
    }
    if (!containsPeriod(citedText, entry.period)) {
      entryFailures.push({ path: `${p}.period`, detail: `period "${entry.period}" not in facts` });
    }
    if (entryFailures.length > 0) {
      dropped.push({ path: p, reason: entryFailures.map((f) => f.detail).join('; ') });
      for (const f of entryFailures) {
        candidates.push({ path: f.path, text: questionText(f.path, 'missing'), reason: 'missing', priority: 1 });
      }
      return;
    }

    // A title outside the facts keeps the entry and asks which title was meant (vague, priority 3).
    if (!containsText(citedText, entry.role)) {
      candidates.push({ path: `${p}.role`, text: questionText(`${p}.role`, 'vague'), reason: 'vague', priority: 3 });
    }

    const bullets = entry.bullets
      .filter((b, j) => checkItem(`${p}.bullets[${j}]`, b.text, b.factIds))
      .map((b) => ({ text: b.text, factIds: [...b.factIds] }));

    accepted.experience.push({ ...entry, bullets });
  });

  accepted.skills = draft.skills
    .filter((s, i) => checkItem(`skills[${i}]`, s.name, s.factIds))
    .map((s) => ({ ...s, factIds: [...s.factIds] }));

  return { accepted, questions: planQuestions(candidates), dropped };
}
