export const meta = {
  name: 'budget-fix',
  description: 'The amendment said "optional" and left one production path with no spend bound at all',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 25 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/llm src/core/generation src/core/jobs src/core/cv src/http tests/guard tests/contract/cvs-answer tests/contract/generation-persist
Lane allowlist FILE: ${SPRINT}allow/lane-budget.txt (api/src/main.ts is on it now — the allowlist was wrong, not your code)
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: a real key sits in .env. Never read it, never print one, never put one in a test or a report.

ADR-021 landed and the reviewer approved everything except one thing, which is mine to own and yours to fix. Read ADR-021 including **Amendment A**, which I have just written.

THE DEFECT. The ADR called the ledger parameter "optional, so a stage called without one behaves exactly as before". That is false in the dangerous direction. Before ADR-021 every single call was bounded at 4096. After it, a call WITHOUT a ledger is bounded by nothing at all — and there is a production caller in exactly that state: api/src/core/cv/answer.ts (the C-009 answer recompose). Answering a question now has no spend bound, which is the opposite of what F-010 asks for and the opposite of what the ADR claimed.

Worse, gateway.test.ts has a test named roughly "a stage called without a ledger is not bounded" that PINS this. By .claude/rules/testing.md, a test that pins a defect is wrong: the code changes and the test is rewritten.

Acceptance:
1. The answer path passes a ledger — one per answer, sized from the same configuration a job uses. A test asserts that answering a question with a tiny balance fails with LLM_BUDGET_EXCEEDED, that the answer is still stored and the question still answered (C-009's 503 branch, ADR-020), and that the code reaching the client is LLM_BUDGET_EXCEEDED rather than a generic one.
2. The test that pins the unbounded behaviour is rewritten to assert what is now true: the optional shape exists for TESTS, and a call without a ledger is unbounded by construction — so the suite must also prove no production code does that (next item).
3. A guard test, in the shape of the one ADR-014 already established at tests/guard/: it scans production sources under api/src and fails if a call into a pipeline stage or the gateway omits the ledger argument, naming the file and line. Prove it catches something — a fixture string it rejects, asserted — and leave no real violation behind.
4. framework/docs/api-contracts.md: the C-012 amendment is currently under **C-003**, which is the wrong section. Move it under C-012. Leave the C-000 enum note where it is.
5. Two things the first review could not verify, close them: config.ts's bad-value rejection has no mutation check, and env.ts has no test for the two new variables. Add both.

Apply the mutation check from .claude/rules/testing.md to every new test and name what went red.

Read first: framework/docs/decisions.md ADR-021 and its Amendment A, framework/docs/spec.md §3.10, api/src/core/cv/answer.ts, api/src/core/jobs/worker.ts, tests/guard/job-writes.guard.test.ts (the pattern for item 3).

Never commit; the Orchestrator commits. Report at most 25 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: tests first, then the code, then the lane-scoped gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. Perform the mutations yourself and name what went red. Then do the thing that matters most: grep every production call site of a pipeline stage and of the gateway under api/src, list them, and say for each whether it passes a ledger. If the guard test would not catch a new one, say so. Run the full gate and check-lane.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
