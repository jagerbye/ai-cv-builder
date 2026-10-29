export const meta = {
  name: 'prose-asks-2',
  description: 'The rule had not reached its own implementation: an uncited bullet is prose and was still being deleted',
  phases: [{ title: 'Fix' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 20 lines' } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation src/core/cv tests/contract/generation-persist
Lane allowlist FILE: ${SPRINT}allow/lane-grounding.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: a real key is in .env — never read it, never print one.

ADR-025 landed and its reviewer found that the rule had not reached its own implementation. Read ADR-025 including **Amendment A**, which I have just written. Two small changes, nothing else.

1. \`verify.ts\` \`checkBullet()\` still DROPS a bullet whose factIds are empty or point at an unknown fact. A bullet is prose, and ADR-025 says prose is never deleted — so the implementation contradicted the decision it was implementing. Keep the bullet and raise a priority-1 question saying it cites no source. One rule, no exception.

   The summary path already behaves this way; make the bullet match it rather than inventing a second shape.

2. \`framework/docs/spec.md\` §3.4 says "The verifier drops any item whose factIds are empty or unknown", which reads as covering the summary and the bullets. Reword it to structured items only — entries, education, skills, contact fields — so nothing in the spec implies prose deletion.

Also confirm, and say so in your report with the assertion that proves it: a skill whose name no cited fact holds is STILL dropped with its question. That behaviour is correct and must not drift while you are in this file.

Every existing assertion about entries, education, contact and skills stays exactly as it is. Apply the mutation check to the changed bullet path and name what went red. Run the FULL gate.

Never commit; the Orchestrator commits. Report at most 20 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: adjust the tests to the new expectation first, then the code, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

return { ok: !!(dev && dev.ok), report: dev && dev.report }
