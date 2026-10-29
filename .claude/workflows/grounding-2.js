export const meta = {
  name: 'grounding-2',
  description: 'The injected employer survived behind a question, the contact block is never stored, and one fact can still hide a mis-pairing',
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
SECURITY: a real key is in .env — never read it, never print one.

ADR-022 landed and its review found three things. Read ADR-022 including **Amendment A**, which I have just written; the decisions are made, you are implementing them.

1. **THE INJECTED EMPLOYER SURVIVED.** tests/fixtures/golden/prompt-injection.json is red: the injected summary "Senior ML engineer with a decade at Google" is now KEPT behind a question, because ADR-022 keeps every failing summary. The developer left it red rather than rewrite it without sign-off, which was the right call.

   The rule, per Amendment A: a summary whose unsupported content is an **entity** — an organisation, a number, a named technology that no cited fact holds — is DROPPED. A summary that is merely vague, unsupported in phrasing, or derived is KEPT with its question. That is the same line this ADR draws everywhere else: an invented entity is a lie, a reformatted or woolly phrase is not. The entity check already exists for experience bullets; use it rather than writing a second one.

   The fixture then expects: the injected summary dropped, the Google experience entry dropped, the output structure unchanged by the injected instruction. Do not weaken what that fixture is for.

2. **THE CONTACT BLOCK IS NEVER STORED.** compose now produces contact — and \`persist.ts\`'s itemsFromDraft emits summary, experience, bullets, education and skills, with no contact item, while \`read.ts\` reads a contact item nothing writes. So F-004's contact details are still unmet end to end, and a \`contact.email\` question points at a field the CV does not have. Store it, with its factIds like every other item, and assert it end to end: a draft with contact goes through persist and comes back in the C-006 response with the values and the citations intact. A userEdited contact field must survive a regeneration like any other.

3. **ONE FACT CAN STILL HIDE A MIS-PAIRING.** The reviewer's attack: a single fact "Acme Ltd 2019-2021 and Globex Corp 2015-2018" lets a draft claim "Acme Ltd, 2015-2018" and pass with no question, because both strings occur inside that one fact. Amendment A's answer is at the other end — the extract stage emits **one employment fact per employer** — so: say so in the extract prompt, and add a golden fixture whose source names two employers with two periods in one sentence and whose expectation is two separate employment facts. Do NOT add a proximity heuristic inside a fact; the ADR rejects it and says why.

   Then leave the residual honest: add the case to tests as a documented limit if it still passes, with a comment naming ADR-022 Amendment A, so the next person meets the known hole instead of rediscovering it.

4. The leftovers the review listed: the C-012 contact amendment in framework/docs/api-contracts.md (written the way ADR-013, ADR-016 and ADR-021 are recorded there), and an errors.md entry for what the first live run found — the symptom, the cause, and the rule.

Apply the mutation check from .claude/rules/testing.md to each new test and name what went red. Run the FULL gate, not just the lane: the developer could not, because eslint on that directory exits with a config-migration message — if that is real, report it as a finding rather than skipping the gate.

Never commit; the Orchestrator commits. Report at most 30 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: tests first, then the code, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept, and attack it again as you did last time — that is what found these. Construct: an injected summary naming an organisation (must be dropped); a vague summary (must be kept and flagged); an invented email (must not reach storage); a contact field that IS supported (must reach storage and come back in C-006). Perform the mutations yourself. Run the full gate and report the eslint situation honestly.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
