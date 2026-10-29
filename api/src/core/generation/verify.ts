// verify(draft, facts): the groundedness gate (spec §3.4, ADR-002, ADR-013). Pure and deterministic:
// no LLM, no clock, no randomness. Drafts and facts are never mutated.
import type { CvDraft, DroppedItem, Fact, VerificationResult } from './types.js';
import { planQuestions, type PlannedQuestion, type QuestionReason } from './questions.js';
import { ambiguousName, containsPeriod, containsText, containsToken, hasDerivedDuration, unsupportedEntity } from './verify-entities.js';

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
function checkCited(text: string, factIds: string[], byId: Map<string, Fact>, inherited: readonly Fact[] = [], role = ''): Failure | null {
  const resolved = resolveCited(factIds, byId);
  if (!('facts' in resolved)) return resolved;
  const cited = [...resolved.facts, ...inherited].map((f) => f.text);
  const entity = unsupportedEntity(text, cited, [role]);
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
  // `path` is the dropped item's own spelling (DroppedItem.path). `questionPath` names the FIELD the question is
  // about (C-006 path grammar), so the editor can align the question beside it.
  const checkItem = (
    path: string,
    text: string,
    factIds: string[],
    inherited: readonly Fact[] = [],
    questionPath: string = path,
  ): boolean => {
    const f = checkCited(text, factIds, byId, inherited, draft.targetRole);
    if (f === null) {
      // ADR-024 tier 2: a single ambiguous capitalised word keeps the item and asks. The lie is removed, the doubt shown.
      const resolved = resolveCited(factIds, byId);
      const cited = 'facts' in resolved ? [...resolved.facts, ...inherited].map((x) => x.text) : [];
      if (ambiguousName(text, cited, [draft.targetRole]) !== null) {
        candidates.push({ path: questionPath, text: questionText(questionPath, 'unverifiable'), reason: 'unverifiable', priority: 2 });
      }
      return true;
    }
    dropped.push({ path, reason: f.detail });
    candidates.push({ path: questionPath, text: questionText(questionPath, f.reason), reason: f.reason, priority: 2 });
    return false;
  };

  const accepted: CvDraft = {
    targetRole: draft.targetRole,
    experience: [],
    education: [],
    skills: [],
  };

  // Contact (ADR-022): strict, per field. A field its own cited facts do not establish is dropped and asked about.
  if (draft.contact !== undefined) {
    const contact: NonNullable<CvDraft['contact']> = {};
    for (const key of ['fullName', 'email', 'phone', 'location'] as const) {
      const field = draft.contact[key];
      if (field === undefined) continue;
      const path = `contact.${key}`;
      const resolved = resolveCited(field.factIds, byId);
      const failure: Failure | null =
        !('facts' in resolved)
          ? resolved
          : someFactHolds(resolved.facts, (t) => containsToken(t, field.value))
            ? null
            : { reason: 'unverifiable', detail: `${key} "${field.value}" not in cited facts` };
      if (failure === null) {
        contact[key] = { value: field.value, factIds: [...field.factIds] };
        continue;
      }
      dropped.push({ path, reason: failure.detail });
      candidates.push({ path, text: questionText(path, failure.reason), reason: failure.reason, priority: 2 });
    }
    if (Object.keys(contact).length > 0) accepted.contact = contact;
  }

  // Education: the institution must be named by a cited fact, else drop. A period no cited fact pairs with it
  // is kept and asked about (ADR-022).
  draft.education.forEach((edu, i) => {
    const p = `education[${i}]`;
    const resolved = resolveCited(edu.factIds, byId);
    if (!('facts' in resolved)) {
      dropped.push({ path: p, reason: resolved.detail });
      const qp = `${p}.institution`;
      candidates.push({ path: qp, text: questionText(qp, resolved.reason), reason: resolved.reason, priority: 2 });
      return;
    }
    if (!someFactHolds(resolved.facts, (t) => containsText(t, edu.institution))) {
      dropped.push({ path: p, reason: `institution "${edu.institution}" not in cited facts` });
      candidates.push({
        path: `${p}.institution`,
        text: 'Which school or university did you attend? The drafted name is not in the source.',
        reason: 'missing',
        priority: 1,
      });
      return;
    }
    if (!someFactHolds(resolved.facts, (t) => containsText(t, edu.institution) && containsPeriod(t, edu.period))) {
      candidates.push({ path: `${p}.period`, text: 'What were the dates of this education? The drafted dates are not in the source.', reason: 'missing', priority: 1 });
    }
    accepted.education.push({ ...edu, factIds: [...edu.factIds] });
  });

  // ADR-022 + Amendment A: a summary that fails is kept and flagged (one editable field, a CV needs a head)
  // UNLESS what fails is an invented entity (an organisation, a figure, a named technology no cited fact holds):
  // that is a lie, not a woolly phrase, and it is dropped with its question. The entity check is the one bullets use.
  if (draft.summary !== undefined) {
    const resolved = resolveCited(draft.summary.factIds, byId);
    const cited = 'facts' in resolved ? resolved.facts.map((f) => f.text) : [];
    const entity = 'facts' in resolved ? unsupportedEntity(draft.summary.text, cited, [draft.targetRole]) : null;
    if (entity !== null) {
      dropped.push({ path: 'summary', reason: `${entity} not in cited facts` });
      candidates.push({ path: 'summary.text', text: questionText('summary.text', 'unverifiable'), reason: 'unverifiable', priority: 2 });
    } else {
      // A duration derived from stated periods (ADR-023) is kept and asked about, like any derivation.
      const failure: Failure | null = !('facts' in resolved)
        ? resolved
        : hasDerivedDuration(draft.summary.text, cited) || ambiguousName(draft.summary.text, cited, [draft.targetRole]) !== null
          ? { reason: 'unverifiable', detail: 'derived quantity or ambiguous name' }
          : null;
      if (failure !== null) {
        candidates.push({ path: 'summary.text', text: questionText('summary.text', failure.reason), reason: failure.reason, priority: 2 });
      }
      accepted.summary = { text: draft.summary.text, factIds: [...draft.summary.factIds] };
    }
  }

  draft.experience.forEach((entry, i) => {
    const p = `experience[${i}]`;

    // The entry cites its own facts (ADR-013). Missing or unknown citations drop the whole entry.
    const resolved = resolveCited(entry.factIds, byId);
    if (!('facts' in resolved)) {
      dropped.push({ path: p, reason: resolved.detail });
      const qp = `${p}.employer`;
      candidates.push({ path: qp, text: questionText(qp, resolved.reason), reason: resolved.reason, priority: 2 });
      return;
    }
    // The employer is strict: a cited fact must name it, else the entry is dropped (ADR-013, ADR-022).
    if (!someFactHolds(resolved.facts, (t) => containsText(t, entry.employer))) {
      dropped.push({ path: p, reason: `employer "${entry.employer}" not in cited facts` });
      candidates.push({ path: `${p}.employer`, text: questionText(`${p}.employer`, 'missing'), reason: 'missing', priority: 1 });
      if (!someFactHolds(resolved.facts, (t) => containsPeriod(t, entry.period))) {
        candidates.push({ path: `${p}.period`, text: questionText(`${p}.period`, 'missing'), reason: 'missing', priority: 1 });
      }
      return;
    }

    // The period is lenient (ADR-022): one the employer's fact does not state keeps the entry and is asked about.
    // This is where recombination (one employer's name, another fact's dates) surfaces: as a visible question.
    if (!someFactHolds(resolved.facts, (t) => containsText(t, entry.employer) && containsPeriod(t, entry.period))) {
      candidates.push({ path: `${p}.period`, text: questionText(`${p}.period`, 'missing'), reason: 'missing', priority: 1 });
    }

    // The title must occur in a cited fact that also names the employer. Otherwise the entry is kept and the
    // title is asked about (vague, priority 3): a source often puts employer and title in separate sentences.
    if (!someFactHolds(resolved.facts, (t) => containsText(t, entry.role) && containsText(t, entry.employer))) {
      candidates.push({ path: `${p}.role`, text: questionText(`${p}.role`, 'vague'), reason: 'vague', priority: 3 });
    }

    // A bullet is checked against its own facts plus its parent entry's facts (one level, ADR-002).
    const bullets = entry.bullets
      .filter((b, j) => checkItem(`${p}.bullets[${j}]`, b.text, b.factIds, resolved.facts, `${p}.bullets[${j}].text`))
      .map((b) => ({ text: b.text, factIds: [...b.factIds] }));

    accepted.experience.push({ ...entry, factIds: [...entry.factIds], bullets });
  });

  accepted.skills = draft.skills
    .filter((s, i) => checkItem(`skills[${i}]`, s.name, s.factIds, [], `skills[${i}].name`))
    .map((s) => ({ ...s, factIds: [...s.factIds] }));

  return { accepted, questions: planQuestions(candidates), dropped };
}
