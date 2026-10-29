export const meta = {
  name: 'entities',
  description: 'Replace the closed list of company names with a closed world over the cited facts',
  phases: [{ title: 'Tests' }, { title: 'Code' }, { title: 'Review' }],
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

THE DEFECT, found by attacking the rule rather than reading it. \`api/src/core/generation/verify-entities.ts\` line 13 holds \`const COMPANIES = ['Google', 'Microsoft', 'Amazon', …]\` and decides whether a generated section invented an organisation by consulting that list. So:
- "Senior engineer with a decade at Google" → dropped. Google is listed.
- "Senior engineer with a decade at Stripe" → KEPT, with no question at all.

This product's single claim is that the model cannot add a fact the user did not give it, and that claim was being enforced against an enumeration of famous companies. Every unlisted organisation passes silently, and the failure is invisible — which is the worst shape a failure can have here.

Implement ADR-023 (framework/docs/decisions.md — read it first; it has the rejected alternatives and the reasoning).

1. **The facts are the vocabulary.** The allowed terms of a generated section are the text of ITS CITED FACTS, plus the target role the user supplied. A capitalised name, an acronym or a figure in the output that appears in neither is unsupported — whatever it is, famous or not. Delete the COMPANIES list; do not replace it with a longer one.

2. **The stoplist is about English, not about companies.** Sentence-initial capitals, the target role's own words, and whatever else is genuinely a language artefact. Keep it small and inspectable, and write a comment saying what it is for — the moment it starts collecting proper nouns it has become the thing this ADR deleted.

3. **Durations versus quantified results**, the same ADR's closing section: "five years", "a decade" are DERIVED from periods the facts do state — kept, questioned. "99% accuracy", "200 engineers" are claims about the world — dropped. Make the distinction explicit and testable rather than a regex nobody can read.

4. Tests, and these are the acceptance:
   - "…a decade at Stripe" with no fact naming Stripe → DROPPED. This is the attack that found the defect and it must fail without the fix.
   - The same sentence when a cited fact DOES name Stripe → kept, no question.
   - An unlisted acronym and a made-up product name, both dropped.
   - A vague summary with no entities at all → kept with its question, not dropped. Watch for false positives here: this is where the new rule can over-fire, and a CV that loses its summary because the model capitalised a word is a regression.
   - The existing prompt-injection golden stays green, and so does every ADR-022 test.

5. Two leftovers from the same review, both small:
   - \`framework/knowledge/errors.md\` has TWO entries numbered **E-009**. Renumber the newer one (the first-live-run entry) to the next free id. Duplicate ids break grep-by-id, which is how that file is meant to be read.
   - \`tests/\` is not linted at all: api's lint is \`eslint .\` scoped to api/, so every root-level contract test and fixture is unlinted and the gate never notices. Bring tests/ under lint and fix what it finds, or report honestly why not.

Apply the mutation check to every new test and name what went red. Run the FULL gate.

Never commit; the Orchestrator commits. Report at most 30 lines.`

const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + BRIEF +
  '\n\nYour step: the failing tests only. The Stripe case is the one that matters — write it first.',
  { label: 'tests', phase: 'Tests', model: 'haiku', schema: RESULT })

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nThe test-engineer reported:\n' + (red ? red.report : '(no report)') +
  '\n\nYour step: make them green, then run the full gate.',
  { label: 'dev', phase: 'Code', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: attack it, as you did the last two rounds — that is what found this. Invent organisations the author could not have anticipated and check each is caught. Then hunt the opposite failure just as hard: find a legitimate summary the new rule WRONGLY drops, because over-firing is how this fix hurts a real user. Perform the mutations. Run the full gate. Report both directions honestly.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
