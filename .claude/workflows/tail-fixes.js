export const meta = {
  name: 'tail-fixes',
  description: 'ADR-020 on the answer path, and a backlog file that still says the sprint has not started',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string' } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder. Lane test: npm -w api run test -- --run src/core/cv tests/contract/cvs-answer. export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run (ADR-019 — the app keeps the other database).
Never commit; the Orchestrator commits. Report at most 20 lines.

1. ADR-020 (framework/docs/decisions.md — accepted, read it). api/src/core/cv/answer.ts has a bare catch that maps every recompose failure to LLM_UNAVAILABLE, so a missing API key is reported as "The generation service is unavailable. Try again later." Nobody configures a key by waiting, and the person who can fix it is told nothing.

   The status stays 503 — C-009's status set is frozen and a recompose that cannot run does make the service unavailable — but the envelope carries the code the failure actually had: CONFIG_MISSING, LLM_AUTH_FAILED, LLM_INVALID_REQUEST, or LLM_UNAVAILABLE when it really is transient. The answer is still stored and the question still answered; do not change that, it is asserted and it is the point of C-009's 503 branch.

   Update framework/docs/api-contracts.md C-009's error list. A test per code asserts the status, the code and that the answer survived; the mutation check applies, so name in your report the line you deleted to see it go red.

2. framework/sprints/backlog.md still says "SPRINT-001 planned, not started" while HISTORY.md records the sprint closed. Make it true: mark what shipped, keep B-021…B-023 parked as they are, and leave B-024 open — it runs next and it is the last thing in this project.

Read first: framework/docs/decisions.md ADR-020, ADR-017 and ADR-018, framework/docs/api-contracts.md C-009, api/src/core/cv/answer.ts, api/src/core/generation/gateway.ts.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: test first, then the code, then the lane-scoped gate.',
  { label: 'fix:tail', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: perform the stub-test mutation yourself (.claude/rules/testing.md — the rule now says performed, not judged): delete the line the new test exists for, run it, require red, restore, and record what you did. Run the full gate once. Confirm the answer is still stored on the failure path.',
  { label: 'review:tail', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
