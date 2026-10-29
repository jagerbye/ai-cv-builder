export const meta = {
  name: 'entities-2',
  description: 'Two tiers for prose, Unicode names, no second closed list, and the five over-fires that eat a real summary',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 30 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation src/core/cv tests/contract/generation-persist
Lane allowlist FILE: ${SPRINT}allow/lane-grounding.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: a real key sits in .env — never read it, never print one.

ADR-023 replaced a list of company names with a closed world over the cited facts. The reviewer then attacked what replaced it with eleven probes and found that it fails in BOTH directions. Implement ADR-024 (framework/docs/decisions.md — read it first; it names every probe and the reasoning).

THE SILENT HOLES — an invented entity kept with no question, which is the shape the whole thing exists to prevent:
1. "Stripe-backed engineer with five years building payments" → kept. Sentence-initial tokens are skipped BEFORE the vocabulary is consulted. Check them like any other token; exempt only words that are genuinely English.
2. "Ørsted engineer leading the platform" → kept. "Инженер в Яндексе" → kept. The tokeniser is \`[A-Z]\`, so every non-ASCII capital is invisible. Use \\p{Lu} with the u flag. A guarantee that holds only for Latin names is a locale, not a guarantee.
3. **\`TECHNOLOGIES\` is still a closed list**, sitting beside the \`COMPANIES\` list ADR-023 deleted — so "Built services in kotlin" passes. Delete it and put nothing in its place: per ADR-024, a lowercase technology name cannot be told from prose deterministically, so this check does not claim to catch one. Write that limit where a reader will meet it, in the module and in the spec section that describes the check.

THE OVER-FIRES — a legitimate summary DELETED, which is worse for a real user than a flagged one:
A. "Experienced Senior Backend Developer with Python skills" → dropped on *Senior*.
B. "Engineer at Acme since March 2019" → dropped on *March*.
C. "Engineer open to Remote roles" → dropped on *Remote*.
D. "Engineer with 1000 users served", fact says "1,000 users" → dropped on a thousands separator.
E. Bullet "Shipped a feature in a year", no stated period → dropped as a duration.

Per ADR-024: a multi-token capitalised sequence or an acronym that the vocabulary does not hold still DROPS — that is the injection shape. A single ambiguous capitalised word raises a QUESTION instead. Month names join the stoplist. Numbers are compared after normalising separators.

AND ONE MORE the reviewer found by mutation: changing the duration check to \`return true\` produced ZERO red tests — there is no test for a claimed duration longer than the stated span. Write it. Also switch the duration maths from the SUM of periods to their ENVELOPE: a real ten-year career with a gap was being rejected, and overlapping periods were over-accepted.

Acceptance: every probe above has a test, each one failing without the fix. The prompt-injection golden stays green. "…a decade at Stripe" with no Stripe fact is still dropped; with a Stripe fact still kept.

Apply the mutation check to every new test and name what went red — including a mutation on the duration check, which last time proved nothing.

Run the FULL gate.

Never commit; the Orchestrator commits. Report at most 30 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: tests first — write the eleven probes as tests before you touch the checker — then the code, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: attack it a third time. Your last two rounds found what two developers and I missed, so do not read the diff and agree with it — invent new inputs. Both directions, and weight them equally: an invented organisation that survives, and a legitimate summary that dies. Try names in other scripts, hyphenated and possessive forms, acronyms inside sentences, numbers written as words, and ordinary English sentences that happen to capitalise something. Perform the mutations, including one on the duration check. Run the full gate. Say plainly whether the guarantee now holds and where it does not.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
