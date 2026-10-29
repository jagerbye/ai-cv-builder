export const meta = {
  name: 'close-qa',
  description: 'The two findings standing between the QA pass and the sprint close: the web client drops the new codes, and the worker can still copy a thrown message into C-005',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

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

const COMMON = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder.',
  'export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.',
  'Lane isolation: bash framework/scripts/check-lane.sh HEAD <your allowlist FILE> (a FILE PATH, not globs). One other lane is in this tree.',
  'GREEN MEANS YOUR LANE: GATE_LANE_TEST=\'<lane test>\' bash framework/scripts/gate.sh.',
  'Every fix needs a test that fails without it. Never commit; the Orchestrator commits. Report at most 25 lines.',
].join('\n')

const WEB = COMMON + `
Lane G · allowlist FILE: ${SPRINT}allow/lane-G.txt · lane test: npm -w web run test -- --run src

ADR-018 added LLM_AUTH_FAILED and LLM_INVALID_REQUEST to the C-000 enum, so that a wrong API key no longer reads as a bug in our own code. The web throws the distinction away again: web/src/api/client.ts keeps its own copy of ERROR_CODES, it does not have the two new ones, and web/src/features/intake/submit.ts:55 downgrades an unknown code to INTERNAL with the generic message. The user is told "something went wrong on our side" for a misconfigured key.

Acceptance:
- The web knows both new codes and shows their real message.
- The duplicated list stops being a trap. An unknown code must NOT be downgraded to a generic INTERNAL: the envelope carries a message precisely so a client that does not recognise a code can still show it truthfully (C-000). Render the server's message for any code the client does not know, and keep whatever special handling exists for the codes it does know. Say in your report what you did about the duplicate list — keeping two hand-synced copies is what caused this.
- A test per new code asserting the user-visible text, and a test that an invented code renders the server's message rather than the generic one.
- Also finish the failed-CV banner if it is not there yet: a CV in state \`failed\` shows its lastError message (C-006, ADR-017) and offers regenerate as the retry. If the banner already exists, say so and assert it.

Read first: framework/docs/decisions.md ADR-017 and ADR-018, framework/docs/api-contracts.md C-000 and C-006, web/src/api/client.ts, web/src/features/intake/submit.ts.`

const API = COMMON + `
Lane H · allowlist FILE: ${SPRINT}allow/lane-F.txt · lane test: npm -w api run test -- --run src/core/jobs src/http tests/contract/generation-persist

One latent leak, found by the lane F review and older than that lane: api/src/core/jobs/worker.ts classify() keeps a thrown error's OWN message whenever its code happens to be in the enum, and writes it to the job row — which C-005 serves to the browser. C-000 says the message is always a fixed string written by us. Nothing throws an enum-coded error with a dangerous message today, so this is latent rather than live; it is also exactly the kind of thing that stops being latent the moment someone adds a code to an error they are re-throwing.

Acceptance:
- The job row's message is safeMessage(code), never the thrown error's text.
- Two existing tests pin the current behaviour — jobs.test.ts around line 404 and generation-persist-failure.test.ts around line 108. Correct them, and record the reason in the lane report: a test that pins a leak is a test that is wrong, which the testing rule allows to be changed with the reason stated.
- A test proves it: throw an error whose code is in the enum and whose message contains a secret-looking string, and assert the string reaches neither the job row, C-005, nor the CV's lastError.

Do not change what classify() does with the CODE — only the message.

Read first: framework/docs/api-contracts.md C-000, api/src/http/errors.ts, api/src/core/jobs/worker.ts.`

async function run(label, brief, test) {
  const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + brief +
    '\n\nYour step: tests first, then the code, then the lane-scoped gate.',
    { label: 'fix:' + label, phase: 'Fix', model: 'sonnet', schema: RESULT })
  const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + brief +
    '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
    '\n\nYour step: verify rather than accept. Run the lane gate and check-lane. For each acceptance item say how you confirmed it, and apply the stub-test lens — if an assertion would pass on the unfixed code, say so.',
    { label: 'review:' + label, phase: 'Review', model: 'haiku', schema: RESULT })
  return { label, dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
}

return await parallel([() => run('web-codes', WEB), () => run('safe-message', API)])
