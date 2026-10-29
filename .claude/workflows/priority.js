export const meta = {
  name: 'priority',
  description: 'Derive question priority from what it costs to ignore, and stop the container tests being switchable off in silence',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 25 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation tests/contract/auth-session-container
Lane allowlist FILE: ${SPRINT}allow-api.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run. The composed stack is up at http://127.0.0.1:3000.
SECURITY: a real key sits in .env — never read it, never print one.

Three things. The first is a decision that has been made; you are implementing it.

1. **ADR-026 (framework/docs/decisions.md — read it first) defines question priority.** You asked the right question last time and the answer is neither of the two options you offered: priority is not derived from the reason, and it is not left ad hoc. It is what it costs the user to IGNORE the question.

   - **1 — content is missing from the CV.** A dropped entry, education, skill or contact field. Only the user's answer brings it back.
   - **2 — content is present but the source does not support it.** Flagged prose, a kept entry whose period the facts do not state.
   - **3 — content is present and vague.**

   Derive the number from that table in ONE place. Every reason stays exactly what it is on every path; you are changing only where the number comes from. Your saved implementation at /private/tmp/claude-501/-Users-mike/57b5388a-556b-4c60-b3fd-9f6d6b43757c/scratchpad/verify.priorityfn.ts is the right shape — the table behind it changes.

   This amends ADR-025, which put flagged prose at 1; under ADR-026 a flag is a 2, because the text is still in the CV where a dropped entry is not. Rewrite the assertions that move. Each one you change, you check against the table rather than against what it used to say — if a case does not fit the table, that is a finding and you report it instead of forcing the number.

   framework/docs/api-contracts.md C-006 states what the three values mean, since a consumer orders by them.

2. **THE CONTAINER TESTS CAN BE SWITCHED OFF IN SILENCE.** The reviewer mutated \`describe.skipIf(!up)\` to \`describe.skipIf(up)\` with the stack running and the suite stayed GREEN — six skipped, nothing reported. Five tests that can be disabled without anything going red are five tests nobody can rely on. The reviewer's own proposal is the fix: count the cases that actually executed and assert the count with the stack up, so the mutation goes red. Implement it and prove it by running that mutation yourself.

3. \`api/src/core/generation/verify.ts\` lines 56-57 carry a whitespace-only indent change left by your revert. Clean it.

Apply the mutation check to every assertion you move. Run the FULL gate with the stack up.

Never commit; the Orchestrator commits. Report at most 25 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: implement, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. Run the skipIf mutation yourself with the stack up and confirm it now goes RED. Then take five questions the system can raise — a dropped skill, a dropped contact field, a flagged summary, an unverified period, a vague one — and check each number against ADR-026\'s table by reading what the user would lose by ignoring it. Run the full gate.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
