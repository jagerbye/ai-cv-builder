export const meta = {
  name: 'grounding',
  description: 'The verifier deleted a real job because the date was reformatted, and the CV has never had a contact block',
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
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run (ADR-019).
SECURITY: a real key is in .env. Never read that file, never print a key. Your tests mock the provider, as they always have.

WHAT HAPPENED. The first end-to-end run against a real model produced a CV with **zero experience entries, zero education entries, no contact block and no summary**, from a source that plainly states two jobs, a degree, a name, an email, a phone and a city. Nothing malfunctioned. These are the real artefacts:

- Extract returned 15 facts, each with a verbatim quote, including
  "Since 2019, works at Brightpath Payments as a backend engineer" and
  "Worked at Ferro Systems from 2016 to 2019 doing data pipelines in Python".
- Compose drafted periods "2019 - Present" and "2016 - 2019".
- The verifier applied ADR-013 — employer and period must co-occur in ONE cited
  fact — found that "2019 - Present" is not a substring of that fact, and
  dropped the entry. It had already raised the right question first:
  "What were the exact dates of this role? The drafted dates are not in the
  cited source." Then it deleted the job it had just asked about.
- The four questions that survived were on education[0].period,
  experience[0].period, experience[1].period and summary.text — all correct,
  all attached to content that no longer exists.
- Skills survived because a skill cites one fact and has no period.

Implement ADR-022 (framework/docs/decisions.md — read it first, it has the reasoning and the rejected alternatives).

1. **Employer strict, period lenient.** An experience entry is kept when a cited fact names its EMPLOYER; an education entry when a cited fact names its INSTITUTION. A period the entry's cited facts do not state no longer drops the entry: it is kept, the drafted value stays, and the question is raised exactly as it is today. The anti-recombination guarantee must still hold and you must prove it still holds — the ADR-013 test where {Acme Ltd, Backend engineer, 2019} is assembled from two unrelated facts must still be caught. Under the new rule it is caught as a question on a visible field rather than as a deletion; assert exactly that, and say in your report what a reader of that test now learns.

2. **Compose emits contact.** \`compose.ts\` has no mention of contact at all today, so a CV cannot carry a name, an email or a phone — while spec.md F-004 requires them and the extract stage already produces contact facts. Add it to the tool schema, the prompt and the validator, with factIds per field like every other section. Contact fields are verified STRICTLY: a wrong email address is a real harm, unlike a reformatted date, so a field its cited facts do not establish is dropped and raises a question. C-012's draft type gains contact; record the amendment in api-contracts.md the way ADR-013, ADR-016 and ADR-021 are recorded there.

3. **The summary is kept with its question** instead of dropped — one editable text field, and a CV with no head is worse than one whose summary is flagged. Separately, the compose prompt must forbid DERIVED quantities: the model wrote "5+ years of experience", which no fact states and which it computed. Add a golden fixture for that.

4. **A golden fixture for the input this actually failed on**: a source saying "Since 2019 I have been at X" and "2016 to 2019 I was at Y", a draft writing "2019 - Present" and "2016 - 2019", and the expectation that both entries SURVIVE with period questions. This is the case that cost the product its entire output; it belongs in the fixtures permanently.

Determinism, the verifier's contract, is unchanged: no clock, no randomness, no model call in verify().

Apply the mutation check from .claude/rules/testing.md to every new test and name the line you deleted and what went red.

Read first: framework/docs/decisions.md ADR-022, ADR-013 and ADR-016; framework/docs/spec.md §3.4 and §3.5; framework/docs/api-contracts.md C-006 and C-012; api/src/core/generation/{verify.ts,verify-entities.ts,compose.ts,questions.ts}.

Never commit; the Orchestrator commits. Report at most 30 lines.`

const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + BRIEF +
  '\n\nYour step: the failing tests only, from the evidence above. No production code.',
  { label: 'tests', phase: 'Tests', model: 'haiku', schema: RESULT })

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nThe test-engineer reported:\n' + (red ? red.report : '(no report)') +
  '\n\nYour step: make them green, then run the lane-scoped gate.',
  { label: 'dev', phase: 'Code', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. Perform the mutations yourself and name what went red. Then answer two questions concretely, because they are the ones that matter: (a) can a draft still pair one employer with another employer\'s dates without the user being told — construct the attempt and say what happens; (b) can an invented email reach a stored CV — construct that attempt too. Run the full gate once.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
