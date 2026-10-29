export const meta = {
  name: 'budget',
  description: 'Split the output cap from the per-job spend budget, name the budget stop, and stop throwing away our own validation message',
  phases: [{ title: 'Tests' }, { title: 'Code' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 25 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/llm src/core/generation src/core/jobs src/http src/env tests/contract/generation-persist
Lane allowlist FILE: ${SPRINT}allow/lane-budget.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run (ADR-019).

SECURITY: there is a real API key in .env. Never read that file, never print a key, never put one in a test or a report. You do not need its value — the tests mock the transport, as they always have.

WHY: this build made its first real model call today and it failed, and the failure was ours. The diagnosis is finished and proven; you are implementing ADR-021 (framework/docs/decisions.md — read it first), not investigating.

What was observed, so you can write the tests from evidence rather than from the ADR's prose:
- extract succeeded on the live model: 15 facts, each with a verbatim sourceQuote.
- compose then failed with LLM_INVALID_OUTPUT, and \`req.parse\` was NEVER CALLED — so the model's output was never even examined. The gateway had already decided.
- Cause: \`tokenBudgetPerCall\` is 4096 and is used for two different jobs — it caps \`max_tokens\` on the request, and it bounds \`input + output\` after the response. A real CV crosses 4096 on compose every time.
- Proof: raising that one number to 32000, changing nothing else, made compose succeed with a good draft.

Implement ADR-021:

1. **Two numbers.** The output cap (\`max_tokens\`) is its own setting, sized so a full CV fits, overridable by environment variable. The spend budget stops being per call.

2. **The budget is per JOB**, which is what spec.md F-010 asks for: "A per-job token budget is enforced; exceeding it fails the job rather than spending unboundedly." It accumulates across everything one job spends — extract, compose, and any schema retry. C-012 gains an OPTIONAL ledger parameter for this: a stage called without one behaves exactly as it does today, so nothing that exists breaks. The job worker creates one ledger per run and passes it. Record the amendment in framework/docs/api-contracts.md C-012 the way ADR-013 and ADR-016 are recorded there.

3. **\`LLM_BUDGET_EXCEEDED\` joins ERROR_CODES** with its own fixed safe message. Then: the CHECK constraint on the CV's error code column covers the enum exactly, so it needs a migration; the gateway's code union is declared \`satisfies readonly ErrorCode[]\`, so it will tell you if you miss a place; and web/src/api/client.ts keeps its own copy with a test that compares the two lists — it will fail until you update it, which is the point of it.

4. **Stop throwing away the validation message.** gateway.ts builds \`problem\` on a schema failure — our own text, never the provider's — and logs only \`{ tool, code }\`. Log \`problem\` too, on the retry and on the final failure. This is the silent catch the coding rule forbids, and it cost a live debugging session today. Never log the model's own text, the source text or any prompt content.

Tests, all of them from the evidence above:
- A compose-sized exchange no longer fails: a mocked response whose input+output exceeds the old 4096 is accepted, because that number no longer bounds a call.
- The per-job budget does bound a job: a ledger with a small balance, two stage calls, and the second one fails with LLM_BUDGET_EXCEEDED — asserting the CODE, not just that it threw.
- A job that exceeds the budget reaches the CV as state failed with lastError LLM_BUDGET_EXCEEDED and its safe message, and the provider's text appears nowhere.
- The gateway logs the validation problem: assert the logged object carries it, and that it carries no prompt or provider content.
- The mutation check from .claude/rules/testing.md on each new test: name the line you deleted and what went red.

Read first: framework/docs/decisions.md ADR-021 and ADR-018, framework/docs/spec.md §3.10, framework/docs/api-contracts.md C-012 and C-000, api/src/core/generation/gateway.ts, api/src/llm/config.ts, api/src/core/jobs/worker.ts.

Never commit; the Orchestrator commits. Report at most 25 lines.`

const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + BRIEF +
  '\n\nYour step: the failing tests only. No production code.',
  { label: 'tests', phase: 'Tests', model: 'haiku', schema: RESULT })

let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nThe test-engineer reported:\n' + (red ? red.report : '(no report)') +
  '\n\nYour step: make them green, then run the lane-scoped gate.',
  { label: 'dev', phase: 'Code', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. Perform the mutations yourself and report what went red. Check specifically that a stage called WITHOUT a ledger still behaves as before (the C-012 amendment is additive or it is a breaking change), that no provider text or prompt content reaches a log, and that the CHECK constraint and the web enum copy both carry the new code. Run the full gate once.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { tests: red && red.report, dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
