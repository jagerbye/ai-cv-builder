// wave-b-flake.js — the two things the integration verifier would not sign off.

export const meta = {
  name: 'wave-b-flake',
  description: 'Find the masked worker error behind the persist flake, and make the cv registry check prove the real editor renders',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'
const COMMON = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder.',
  'export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.',
  'Wave B is integrated and the wave marker is gone: bash framework/scripts/gate.sh now runs the UNION and is the definition of green. Everything in this tree is approved work, so a red you cause is yours.',
  'Never commit; the Orchestrator commits. Report at most 30 lines.',
].join('\n')

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 30 lines' },
    fixes: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const FLAKE = COMMON + `

=== The persist flake, and the silent catch that hides it ===

tests/contract/generation-persist.test.ts's first case fails roughly one run in three. The Integrator captured one failure: the job row was written \`status=failed, errorCode=INTERNAL, errorMessage="The generation failed."\` seventeen milliseconds after the run started, the lease was intact, and the CV was untouched. So stages() threw something that is not a domain error, and nobody can say what, because api/src/core/jobs/worker.ts classify() throws the original away:

    return { code: 'INTERNAL', message: GENERATION_FAILED_MESSAGE };

That is a silent catch, which .claude/rules/coding-standards.md forbids outright, and it is the reason a reproducible failure has survived several passes as "a flake". The client must still never see a provider or driver message (rules/security.md, C-000) — but the server has to be able to say what happened. api/src/http/errors.ts already shows the house pattern: log the error's class and code, never its message or the request content.

Your task, in this order:

1. Give createJobWorker a logger (or an onError callback) and use it wherever an error is turned into a row: the INTERNAL branch of classify, the JobLeaseLost paths, and the budget timeout. Log error name, code, job id and attempt. Do not log the message, the CV content or the source text. api/src/main.ts passes the app's logger; a test may pass a collector. Default to a no-op so no existing caller breaks.

2. NOW reproduce. Run the api contract suite in a loop until the case fails with your logging in place — \`for i in $(seq 1 15); do ... done\` — and read what it says. Report the actual error name and code. Do not guess.

3. Fix the cause, with a test that fails without the fix. If the cause is in a test rather than in the worker, fix it there and say so with the reason, as the testing rule requires. Candidates worth checking if your log points at them, but do not assume any of them: the interactive-transaction timeout on a multi-round-trip persist, a row the test has not committed when the worker claims, a fact-id validation throw from persistDraft, a job claimed by a worker from another suite.

4. Prove it: 15 consecutive full api runs with no failure. Report the count you actually ran.

If after real reproduction the cause is outside api/src/core/jobs and api/src/core/cv, stop and report it with blockedOn set rather than widening your own scope.

Files: api/src/core/jobs/**, api/src/core/cv/persist.ts, api/src/main.ts, tests/contract/generation-persist*.
Read first: api/src/core/jobs/worker.ts, api/src/http/errors.ts, framework/knowledge/errors.md (grep for the symptom first — E-003 was just added), .claude/rules/coding-standards.md.`

const REGISTRY = COMMON + `

=== The cv registry check proves less than it looks ===

web/src/app/routes.test.tsx mounts each feature's route and asserts a screen marker. For cv the marker is 'h1', and the test stubs fetch with a C-000 NOT_FOUND envelope — so the component renders its ERROR state, which now has an h1. The assertion passes without the editor existing at all. A regression that kept the error heading and dropped the whole editor would go unnoticed, which is exactly what this test is for.

The other three features do not have this problem: their screens render their marker in the state the stub produces.

Your task: make the cv case prove the loaded editor renders.
- Stub a successful C-006 response for the cv route's fetch instead of a 404 (the shape is in framework/docs/api-contracts.md C-006, and web/src/features/cv/types.ts has the DTO), wait for the query to resolve, and assert a marker only the loaded editor renders — a field, a section, something structural from web/src/features/cv/editor.tsx, not a heading any state would produce.
- Keep the existing guarantees: an empty render still fails, and a route that regresses to a placeholder still fails.
- Do not weaken the other three features' cases and do not touch production code. If the editor genuinely cannot render in this harness, say why with blockedOn set rather than asserting something weaker.

Files: web/src/app/routes.test.tsx only.
Read first: web/src/features/cv/editor.tsx, web/src/features/cv/route.test.tsx (it already mounts the loaded editor — borrow its approach), framework/docs/api-contracts.md C-006.`

const out = await parallel([
  async () => {
    const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + FLAKE,
      { label: 'fix:flake', phase: 'Fix', model: 'sonnet', schema: RESULT })
    const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + FLAKE +
      '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
      '\n\nYour step: verify the claim, do not take it. Run the full gate twice yourself and report both outcomes. Check that the logger does not print a message, a quote or any source text. Check that the fix has a test that fails without it — revert the fix in your head and say which assertion goes red. If the developer reports "could not reproduce", that is a rejection unless they ran at least 15 attempts and say so.',
      { label: 'review:flake', phase: 'Review', model: 'haiku', schema: RESULT })
    return { task: 'flake', dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
  },
  async () => {
    const dev = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + REGISTRY,
      { label: 'fix:registry', phase: 'Fix', model: 'haiku', schema: RESULT })
    const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + REGISTRY +
      '\n\nThe test-engineer reported:\n' + (dev ? dev.report : '(no report)') +
      '\n\nYour step: run npm -w web run test -- --run src/app and report the result. Then answer concretely: if web/src/features/cv/editor.tsx were replaced by a component rendering only an h1, would this test fail? If the answer is no, reject.',
      { label: 'review:registry', phase: 'Review', model: 'haiku', schema: RESULT })
    return { task: 'registry', dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
  },
])

return out
