// verify(draft, facts): the groundedness gate (spec §3.4, ADR-002, ADR-013). Pure and deterministic:
// no LLM, no clock, no randomness. Drafts and facts are never mutated.
import type { CvDraft, DroppedItem, Fact, VerificationResult } from './types.js';
import { planQuestions, type PlannedQuestion, type QuestionReason } from './questions.js';
import { containsPeriod, containsText, unsupportedEntity } from './verify-entities.js';

interface Failure {
  reason: Exclude<QuestionReason, 'vague'>;
  detail: string;
}

// Resolves cited ids to facts. Unknown ids are reported, never silently skipped.
function resolveCited(factIds: string[], byId: Map<string, Fact>): { facts: Fact[] } | Failure {
  if (factIds.length === 0) return { reason: 'missing', detail: 'no cited factIds' };
  const unknown = factIds.filter((id) => !byId.has(id));
  if (unknown.length > 0) return { reason: 'unverifiable', detail: `unknown factIds: ${unknown.join(', ')}` };
  return { facts: factIds.map((id) => byId.get(id)!) };
}

// Citation rule for bullets, summary and skills: every item cites facts, each id must exist, and the
// item's entities must occur in its own cited facts plus the inherited facts of its parent entry
// (ADR-002 amendment, one level of parent to child only).
function checkCited(text: string, factIds: string[], byId: Map<string, Fact>, inherited: readonly Fact[] = []): Failure | null {
  const resolved = resolveCited(factIds, byId);
  if (!('facts' in resolved)) return resolved;
  const cited = [...resolved.facts, ...inherited].map((f) => f.text);
  const entity = unsupportedEntity(text, cited);
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

// Co-occurrence (ADR-013 amendment): recombination is defeated by one cited fact that holds both halves of a
// pair, not by per-field checks over a set. Each predicate is evaluated against a single fact's text.
const someFactHolds = (facts: readonly Fact[], test: (text: string) => boolean): boolean =>
  facts.some((f) => test(f.text));

// questions carry reason and priority (PlannedQuestion), a narrowing of the frozen QuestionDraft[].
export interface PlannedVerification extends VerificationResult {
  questions: PlannedQuestion[];
}

export function verify(draft: CvDraft, facts: readonly Fact[]): PlannedVerification {
  const byId = new Map(facts.map((f) => [f.id, f] as const));
  const dropped: DroppedItem[] = [];
  const candidates: PlannedQuestion[] = [];

  // Missing and unverifiable drops are priority 2; employer and period drops are priority 1 (see below).
  const checkItem = (path: string, text: string, factIds: string[], inherited: readonly Fact[] = []): boolean => {
    const f = checkCited(text, factIds, byId, inherited);
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

  // Education: institution and period must occur in the entry's OWN cited facts (ADR-013), else drop.
  draft.education.forEach((edu, i) => {
    const p = `education[${i}]`;
    const resolved = resolveCited(edu.factIds, byId);
    if (!('facts' in resolved)) {
      dropped.push({ path: p, reason: resolved.detail });
      candidates.push({ path: p, text: questionText(p, resolved.reason), reason: resolved.reason, priority: 2 });
      return;
    }
    const citedText = resolved.facts.map((f) => f.text).join('\n');
    const fails: { path: string; detail: string }[] = [];
    if (!containsText(citedText, edu.institution)) {
      fails.push({ path: `${p}.institution`, detail: `institution "${edu.institution}" not in cited facts` });
    }
    if (!containsPeriod(citedText, edu.period)) {
      fails.push({ path: `${p}.period`, detail: `period "${edu.period}" not in cited facts` });
    }
    if (fails.length === 0) {
      const paired = someFactHolds(resolved.facts, (t) => containsText(t, edu.institution) && containsPeriod(t, edu.period));
      if (paired) {
        accepted.education.push({ ...edu, factIds: [...edu.factIds] });
        return;
      }
      dropped.push({ path: p, reason: `no cited fact names both institution "${edu.institution}" and period "${edu.period}"` });
      candidates.push({
        path: `${p}.institution`,
        text: 'Which school or university did you attend, and in which years? The cited facts name them separately.',
        reason: 'missing',
        priority: 1,
      });
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

    // The entry cites its own facts (ADR-013). Missing or unknown citations drop the whole entry.
    const resolved = resolveCited(entry.factIds, byId);
    if (!('facts' in resolved)) {
      dropped.push({ path: p, reason: resolved.detail });
      candidates.push({ path: p, text: questionText(p, resolved.reason), reason: resolved.reason, priority: 2 });
      return;
    }
    const citedText = resolved.facts.map((f) => f.text).join('\n');

    // Employer and period are the entry's own facts: missing either drops the whole entry (priority 1).
    const entryFailures: { path: string; detail: string }[] = [];
    if (!containsText(citedText, entry.employer)) {
      entryFailures.push({ path: `${p}.employer`, detail: `employer "${entry.employer}" not in cited facts` });
    }
    if (!containsPeriod(citedText, entry.period)) {
      entryFailures.push({ path: `${p}.period`, detail: `period "${entry.period}" not in cited facts` });
    }
    if (entryFailures.length > 0) {
      dropped.push({ path: p, reason: entryFailures.map((f) => f.detail).join('; ') });
      for (const f of entryFailures) {
        candidates.push({ path: f.path, text: questionText(f.path, 'missing'), reason: 'missing', priority: 1 });
      }
      return;
    }

    // Recombination: one cited fact must hold both the employer and the period (ADR-013). Two real facts about
    // two different jobs fail here even though each field occurs somewhere in the citation.
    if (!someFactHolds(resolved.facts, (t) => containsText(t, entry.employer) && containsPeriod(t, entry.period))) {
      dropped.push({ path: p, reason: `no cited fact names both employer "${entry.employer}" and period "${entry.period}"` });
      candidates.push({
        path: `${p}.employer`,
        text: 'Which employer did this role happen at, and during which years? The cited facts name them separately.',
        reason: 'missing',
        priority: 1,
      });
      return;
    }

    // The title must occur in a cited fact that also names the employer. Otherwise the entry is kept and the
    // title is asked about (vague, priority 3): a source often puts employer and title in separate sentences.
    if (!someFactHolds(resolved.facts, (t) => containsText(t, entry.role) && containsText(t, entry.employer))) {
      candidates.push({ path: `${p}.role`, text: questionText(`${p}.role`, 'vague'), reason: 'vague', priority: 3 });
    }

    // A bullet is checked against its own facts plus its parent entry's facts (one level, ADR-002).
    const bullets = entry.bullets
      .filter((b, j) => checkItem(`${p}.bullets[${j}]`, b.text, b.factIds, resolved.facts))
      .map((b) => ({ text: b.text, factIds: [...b.factIds] }));

    accepted.experience.push({ ...entry, factIds: [...entry.factIds], bullets });
  });

  accepted.skills = draft.skills
    .filter((s, i) => checkItem(`skills[${i}]`, s.name, s.factIds))
    .map((s) => ({ ...s, factIds: [...s.factIds] }));

  return { accepted, questions: planQuestions(candidates), dropped };
}
