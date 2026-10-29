export const meta = {
  name: 'lane-f-fix',
  description: 'Close lane F: the clear-on-success test that proves nothing, the missing CHECK, and the two provider codes that collapse to INTERNAL',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'
const LANE_TEST = "npm -w api run test -- --run src/core/cv src/core/jobs src/core/generation/gateway src/http tests/contract/generation-persist tests/contract/cvs-read"

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 25 lines' },
    fixes: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder. Lane F.
Lane test command: ${LANE_TEST}
Lane allowlist FILE: ${SPRINT}allow/lane-F.txt — bash framework/scripts/check-lane.sh HEAD ${SPRINT}allow/lane-F.txt (a FILE PATH, not globs). api/src/http/errors.ts and api/src/core/generation/gateway* are now on it, which settles the first blocking item: safeMessage belongs beside the message map it reads, and the allowlist was wrong, not the code.
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.
Never commit; the Orchestrator commits. Report at most 25 lines.

ADR-017 landed: a failed CV carries lastError {code, message} in C-006, and the reviewer verified every acceptance criterion. Three things remain, and the third is a spec violation the review turned up on its own.

1. A TEST THAT PROVES NOTHING. persist.ts clears lastError on success, and no test isolates that: every success case starts from a CV that never failed, and the regeneration case clears the columns at regenerate time before the run. The reviewer checked the way the stub-test rule asks — delete the null-clear from persist.ts and the suite stays green. Write the missing case: set a CV to failed WITH lastError, enqueue a plain job (not a regenerate), let it succeed, and assert both columns are null and C-006 carries no lastError. Verify it fails with the clear removed, and say so in the report.

2. NO CHECK ON A CLOSED SET. last_error_code is bare text while the house style (framework/docs/database-schema.md, the state column) constrains a closed set with a CHECK. Add one over the C-000 codes, in a migration in the house style, and keep database-schema.md in step. If you conclude a CHECK is wrong here, say why instead — but say it.

3. ADR-018 (framework/docs/decisions.md, accepted — read it first). gateway.ts classifies LLM_AUTH_FAILED and LLM_INVALID_REQUEST, neither is in ERROR_CODES, so both arrive as INTERNAL. F-010 asks for the opposite: invalid-request and auth errors fail the job with a DISTINCT code. A wrong API key currently reads as a bug in our own code, which is the single most likely failure in a fresh deployment and the one whose remedy is most different.

   Both codes join ERROR_CODES with their own fixed safe messages — safe meaning ours, never the provider's text. Make the gateway's internal code union and the contract enum the SAME list, so the next divergence is a compile error rather than a silent downgrade; that is the part of this item that matters. Update framework/docs/api-contracts.md C-000 and add a test per code asserting what reaches the job row, the CV's lastError and the HTTP envelope.

   The CHECK from item 2 must cover the new codes too — if you add the codes after the CHECK, you have two migrations or one; your call, but the final schema must accept exactly the enum and nothing else.

Read first: framework/docs/decisions.md ADR-017 and ADR-018, framework/docs/api-contracts.md C-000 and C-006, api/src/http/errors.ts, api/src/core/generation/gateway.ts, api/src/core/jobs/worker.ts, api/src/core/cv/persist.ts, framework/docs/database-schema.md.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: tests first for all three, then the code, then the lane-scoped gate.',
  { label: 'fix:F', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. For item 1, do the mutation yourself — remove the clear, run the new test, report whether it goes red, restore the file. For item 3, confirm the gateway union and ERROR_CODES cannot drift apart without failing to compile, and that no provider text reaches a message. Run the lane gate and check-lane. If you reject, list every blocking item in `fixes`.',
  { label: 'review:F', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
