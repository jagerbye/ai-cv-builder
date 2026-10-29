// verify(draft, facts): the groundedness gate (spec §3.4, ADR-002, ADR-013). Pure and deterministic:
// no LLM, no clock, no randomness. Drafts and facts are never mutated.
// ADR-025: every structured claim (experience entry, education entry, skill, contact field) is grounded in a cited fact
// or it is dropped; prose (summary, bullet text) is never dropped: an unsupported phrase, or a missing citation, is
// flagged with a question and the text is kept.
import type { CvDraft, DroppedItem, Fact, VerificationResult } from './types.js';
import { planQuestions, priorityFor, type QuestionImpact, type PlannedQuestion, type QuestionReason } from './questions.js';
import { containsPeriod, containsText, containsToken, unsupportedPhrase } from './verify-entities.js';

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

const ROLE_UNTIED_TEXT = 'Which job title did you hold? The cited source mentions this title but does not tie it to this employer.';

function questionText(path: string, reason: QuestionReason): string {
  if (path.endsWith('.employer')) return 'Which employer did this role happen at? The drafted name is not in the cited source.';
  if (path.endsWith('.period')) return 'What were the exact dates of this role? The drafted dates are not in the cited source.';
  if (path.endsWith('.role') && reason === 'vague') return ROLE_UNTIED_TEXT;
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
  // The ONLY place a priority is chosen (ADR-026): from what ignoring the question costs, via priorityFor. The
  // reason is whatever the path says it is and does not decide the number.
  const ask = (q: Omit<PlannedQuestion, 'priority'> & { impact: QuestionImpact }): void => {
    const { impact, ...rest } = q;
    candidates.push({ ...rest, priority: priorityFor(impact) });
  };

  // ADR-025: prose (summary, bullet text) is never deleted for what it says. A phrase the cited facts do not support
  // (a name, a figure, a technology, a duration) raises a priority-2 question beside the field and the text stays.
  // `questionPath` names the FIELD the question is about (C-006 path grammar), so the editor can align it.
  const flagProse = (questionPath: string, text: string, cited: readonly Fact[]): void => {
    const phrase = unsupportedPhrase(text, cited.map((f) => f.text), [draft.targetRole]);
    if (phrase === null) return;
    ask({
      path: questionPath,
      text: `The drafted text contains ${phrase}, which the cited source does not support. Is it correct?`,
      reason: 'unverifiable',
      impact: 'unsupported'
    });
  };

  // A bullet is checked against its own facts plus its parent entry's facts (one level, ADR-002). A bullet that
  // cites nothing, or an unknown fact, is KEPT and asked about (priority 2, ADR-026): prose is never deleted.
  const checkBullet = (text: string, factIds: string[], inherited: readonly Fact[], questionPath: string): void => {
    const resolved = resolveCited(factIds, byId);
    if (!('facts' in resolved)) {
      ask({ path: questionPath, text: questionText(questionPath, resolved.reason), reason: resolved.reason, impact: 'unsupported' });
      return;
    }
    flagProse(questionPath, text, [...resolved.facts, ...inherited]);
  };

  // A skill is a discrete claim, like an institution: a cited fact must hold its name, else it is dropped.
  const checkSkill = (i: number, name: string, factIds: string[]): boolean => {
    const path = `skills[${i}]`;
    const resolved = resolveCited(factIds, byId);
    const failure: Failure | null = !('facts' in resolved)
      ? resolved
      : someFactHolds(resolved.facts, (t) => containsText(t, name))
        ? null
        : { reason: 'unverifiable', detail: `skill "${name}" not in cited facts` };
    if (failure === null) return true;
    dropped.push({ path, reason: failure.detail });
    ask({ path: `${path}.name`, text: questionText(`${path}.name`, failure.reason), reason: failure.reason, impact: 'missing' });
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
      ask({ path, text: questionText(path, failure.reason), reason: failure.reason, impact: 'missing' });
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
      ask({ path: qp, text: questionText(qp, resolved.reason), reason: resolved.reason, impact: 'missing' });
      return;
    }
    if (!someFactHolds(resolved.facts, (t) => containsText(t, edu.institution))) {
      dropped.push({ path: p, reason: `institution "${edu.institution}" not in cited facts` });
      ask({
        path: `${p}.institution`,
        text: 'Which school or university did you attend? The drafted name is not in the source.',
        reason: 'missing',
        impact: 'missing'
      });
      return;
    }
    if (!someFactHolds(resolved.facts, (t) => containsText(t, edu.institution) && containsPeriod(t, edu.period))) {
      ask({ path: `${p}.period`, text: 'What were the dates of this education? The drafted dates are not in the source.', reason: 'missing', impact: 'unsupported' });
    }
    accepted.education.push({ ...edu, factIds: [...edu.factIds] });
  });

  // ADR-025: the summary is prose. It always stays; one that cites nothing, or an unknown fact, is asked about
  // (priority 2), as is one the cited facts do not support (ADR-026).
  if (draft.summary !== undefined) {
    const resolved = resolveCited(draft.summary.factIds, byId);
    if ('facts' in resolved) flagProse('summary.text', draft.summary.text, resolved.facts);
    else ask({ path: 'summary.text', text: questionText('summary.text', resolved.reason), reason: resolved.reason, impact: 'unsupported' });
    accepted.summary = { text: draft.summary.text, factIds: [...draft.summary.factIds] };
  }

  draft.experience.forEach((entry, i) => {
    const p = `experience[${i}]`;

    // The entry cites its own facts (ADR-013). Missing or unknown citations drop the whole entry.
    const resolved = resolveCited(entry.factIds, byId);
    if (!('facts' in resolved)) {
      dropped.push({ path: p, reason: resolved.detail });
      const qp = `${p}.employer`;
      ask({ path: qp, text: questionText(qp, resolved.reason), reason: resolved.reason, impact: 'missing' });
      return;
    }
    // The employer is strict: a cited fact must name it, else the entry is dropped (ADR-013, ADR-022).
    if (!someFactHolds(resolved.facts, (t) => containsText(t, entry.employer))) {
      dropped.push({ path: p, reason: `employer "${entry.employer}" not in cited facts` });
      ask({ path: `${p}.employer`, text: questionText(`${p}.employer`, 'missing'), reason: 'missing', impact: 'missing' });
      if (!someFactHolds(resolved.facts, (t) => containsPeriod(t, entry.period))) {
        ask({ path: `${p}.period`, text: questionText(`${p}.period`, 'missing'), reason: 'missing', impact: 'missing' });
      }
      return;
    }

    // The period is lenient (ADR-022): one the employer's fact does not state keeps the entry and is asked about.
    // This is where recombination (one employer's name, another fact's dates) surfaces: as a visible question.
    if (!someFactHolds(resolved.facts, (t) => containsText(t, entry.employer) && containsPeriod(t, entry.period))) {
      ask({ path: `${p}.period`, text: questionText(`${p}.period`, 'missing'), reason: 'missing', impact: 'unsupported' });
    }

    // The title must occur in a cited fact that also names the employer (ADR-026). One no cited fact holds is
    // unsupported content (priority 2); one held only by facts that do not name the employer is vague (priority 3):
    // a source often puts employer and title in separate sentences. The entry is kept either way.
    if (!someFactHolds(resolved.facts, (t) => containsText(t, entry.role) && containsText(t, entry.employer))) {
      if (someFactHolds(resolved.facts, (t) => containsText(t, entry.role))) {
        ask({ path: `${p}.role`, text: questionText(`${p}.role`, 'vague'), reason: 'vague', impact: 'vague' });
      } else {
        ask({ path: `${p}.role`, text: questionText(`${p}.role`, 'unverifiable'), reason: 'unverifiable', impact: 'unsupported' });
      }
    }

    const bullets = entry.bullets.map((b, j) => {
      checkBullet(b.text, b.factIds, resolved.facts, `${p}.bullets[${j}].text`);
      return { text: b.text, factIds: [...b.factIds] };
    });

    accepted.experience.push({ ...entry, factIds: [...entry.factIds], bullets });
  });

  accepted.skills = draft.skills
    .filter((s, i) => checkSkill(i, s.name, s.factIds))
    .map((s) => ({ ...s, factIds: [...s.factIds] }));

  return { accepted, questions: planQuestions(candidates), dropped };
}
