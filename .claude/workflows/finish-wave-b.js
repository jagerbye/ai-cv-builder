// finish-wave-b.js — wave B stopped on four decisions, not on four failures.
//
// Every lane that stopped, stopped the way FF-11 asked it to: blockedOn set to
// `decision`, no code improvised, no stronger model burned retyping the same
// task. Each decision is made here, in the brief, and the lane resumes.
//
// Lane 08 hands api/src/server.ts to lane 07 when it is done with it, which is
// why those two run as one chain rather than side by side.

export const meta = {
  name: 'finish-wave-b',
  description: 'Resolve wave B\'s four decisions, finish the hardening, the editor, the queue guard, and run answer / regenerate / inline questions',
  phases: [
    { title: 'Decide' }, { title: 'Tests' }, { title: 'Code' }, { title: 'Review' }, { title: 'Fix' },
  ],
}

const BASE = 'f2fefce'
const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const PREAMBLE = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder. Sprint: ' + SPRINT,
  'Lane isolation: bash framework/scripts/check-lane.sh ' + BASE + ' <your allowlist FILE>. The second argument is a FILE PATH, not a list of globs — passing globs makes the script read a file that does not exist and report every path as a violation. Your allowlist file is named below; it already exists.',
  'Four other lanes have uncommitted work in this same tree. check-lane will therefore show you THEIR files. Those are not your violations: judge only the paths your own allowlist covers.',
  'GREEN MEANS YOUR LANE. Run the gate as: GATE_LANE_TEST=\'<your lane test command>\' bash framework/scripts/gate.sh — database + lint + your tests, which is the whole definition of green for you. Never run the root test command, and never report red for a failure in a file your task does not own.',
  'Tests need the database: export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand. The gate does this for you.',
  'If you are still blocked after the decision below, say so with blockedOn set rather than improvising. Do not write yourself an ADR.',
  'Jira is virtual (board.md, ADR-009). Never commit; the Orchestrator commits. Report at most 30 lines.',
].join('\n')

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 30 lines' },
    fixes: { type: 'array', items: { type: 'string' }, description: 'reviewer only: the blocking fix-list, one item per entry' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const LANES = {
  '07': { test: "npm -w api run test -- --run src/core/cv tests/contract/cvs-answer tests/contract/cvs-regenerate",
          allow: SPRINT + 'allow/lane-07.txt' },
  '08': { test: "npm -w api run test -- --run src/http src/routes tests/contract/hardening tests/contract/cvs-create",
          allow: SPRINT + 'allow/lane-08.txt' },
  '09': { test: "npm -w web run test -- --run src/features/cv src/api",
          allow: SPRINT + 'allow/lane-09.txt' },
  '11': { test: "npm -w api run test -- --run src/core/jobs tests/guard tests/contract/jobs",
          allow: SPRINT + 'allow/lane-11.txt' },
}

// ---------------------------------------------------------------- decisions

const D_PIPELINE = `DECISION (Architect, T-20's blocker — how the route reaches the C-012 pipeline):

Option A, as the blocked developer recommended. buildServer takes an options object:

    buildServer(options?: { generationPipeline?: GenerationPipeline })

- It follows the one precedent in this codebase: core/jobs/worker.ts takes the pipeline as a parameter. A Fastify decorator would invent a second convention for the same dependency.
- Missing wiring becomes a type error rather than an undefined property at request time.
- server.ts constructs the real gateway-backed pipeline when no option is passed, so production is wired by default and the test passes a fake.
- The unwired / unconfigured case: the gateway already classifies a missing or rejected key, and the route maps ANY recompose failure to 503 LLM_UNAVAILABLE with the answer still stored, exactly as C-009 says. We are NOT adding a CONFIG_MISSING branch to C-009 — the contract is frozen and a missing key is a degenerate deployment, not a new contract case. F-010's "clear configuration error" lives on the job path, which already has it.

api/src/server.ts is on your allowlist for this reason. Lane 08 has finished with that file; you are the only lane editing it now. Touch only what this wiring needs — the error envelope and the rate-limit hook already installed there are not yours.`

const D_RATELIMIT = `DECISION (Teamlead, T-21's blocker — 8 tests in tests/contract/cvs-create.test.ts now answer 429):

The limiter is right and the test is wrong. That suite creates one session user in beforeAll and then makes some seventy writes through it; 60 writes per minute per user is the spec (F-010), so a real user doing that would also be throttled. Turning the limiter off under NODE_ENV=test would mean the one thing F-010 asks for is the one thing no test covers.

So: give the limiter a test-visible reset — an exported function that clears the counters, or a hook factory the test can re-create — and call it in that suite's beforeEach. Nothing about the production path changes, and the hardening tests that assert the limit still assert it.

tests/contract/cvs-create.test.ts is on your allowlist for this fix. Do not weaken any assertion in it: the file's subject is multipart rejection and ownership, and every one of those assertions stays exactly as it is. You are adding a reset to its setup, nothing else. If a test fails for any reason OTHER than the 429, stop and report it — that would be a real regression from this lane.`

const D_EDITOR = `DECISION (Teamlead, T-22's blocker — 7 red tests the developer correctly refused to weaken):

All seven are test-authoring defects, and correcting a defective test is allowed when the reason is recorded (.claude/rules/testing.md). Record it in the lane log. The three causes and their fixes:

1. Ambiguous roles inside an entry: within(article).getByRole('button', {name: 'Delete'}) matches both the entry's button and its bullets'. Fix it in the PRODUCTION code, not only in the query — rename the bullet controls to "Delete bullet", "Move bullet up", "Move bullet down". A screen-reader user hearing "Delete" twice inside one article has the same problem the test has, so this is an accessibility fix that happens to disambiguate the query.
2. "Location" matches both the contact field and an experience field: scope the query to the contact region.
3. The 409 tests call api.setServer(version 9) BEFORE mounting, so the page loads version 9 and no conflict can occur: mount, await the first load, THEN set the server's version. The conflict must be created after the client has read a version, which is what a conflict IS.

Do not change what the tests assert. Change only how they reach the element and when they set up the conflict.`

const D_GUARD = `DECISION (Teamlead, T-25's blocker — tests/guard is not in api/vitest.config.ts's include):

Approved, add it. api/vitest.config.ts is on your allowlist. A guard test that never runs is worse than no guard: it reads as protection in the file list and protects nothing.

Verify it after: the guard must actually execute under your lane command and under the union, and it must fail when a violating file exists. Prove the second half the way the brief asked — a fixture string the detector rejects, asserted, with no real violating file left behind.`

// ------------------------------------------------------------------- tasks

const TASKS = {

'FIX-T-21': { lane: '08', kind: 'fix', title: 'Hardening: the contract suite meets the rate limiter', brief:
`${D_RATELIMIT}

The rest of T-21 was reviewed and approved: the envelope is installed on the /api context, jobs.ts and cvs-create.ts go through requireUser, and the limiter is one global hook on an injected clock with Retry-After and boundary tests at 3599/3601s and 60/61s. Do not re-open any of it.

Non-blocking items from the same review, clear them if they are cheap and say so if they are not: they are listed in the reviewer's report below.` },

'T-20': { lane: '07', kind: 'full', title: 'Answer a question → user fact → section-scoped recompose', brief:
`Contract C-009, spec F-005 and F-006. POST /api/cvs/:cvId/questions/:questionId/answer.

${D_PIPELINE}

The failing tests for this task already exist at tests/contract/cvs-answer.test.ts — the test-engineer wrote them before the lane stopped. Read them first; adjust them only where the decision above requires it (buildServer takes an option instead of being decorated).

Acceptance:
- The answer is stored as a USER-SOURCED fact. A user fact is trusted: it bypasses the groundedness verifier by design (F-006) and is available to the recompose like any other fact.
- Only the section owning the question's path is recomposed. The response is the full C-006 shape, and a contract test asserts every other section — and every userEdited field anywhere — is identical to what it was before the call. That assertion is the task.
- The question is marked answered. Answering twice returns 409 CONFLICT. An unknown cvId or questionId, or another user's CV, returns 404 NOT_FOUND, never 403.
- If the recompose fails, the answer is STILL stored and the question still counts as answered; the call returns 503 LLM_UNAVAILABLE. Prove it with a test that makes the pipeline throw.
- The LLM is mocked at the C-012 seam. No network, no API key.

Files: api/src/core/cv/*, api/src/routes/cvs.ts, api/src/server.ts (the wiring above only), tests/contract/cvs-answer*.

Read first: framework/docs/api-contracts.md C-009 and C-006, framework/docs/spec.md §3.5 and §3.6, framework/docs/decisions.md ADR-002 and ADR-013, api/src/core/jobs/worker.ts (the DI precedent).

If a test of yours commits a non-terminal generation_jobs row, enqueue it through api/src/core/jobs/test-lock.ts — openJobTestSuite().enqueue() takes the suite lock for you (ADR-014, E-002). Do not edit that file; lane 11 owns it.` },

'T-26': { lane: '07', kind: 'full', title: 'Regenerate', brief:
`Contract C-010, frozen in sprint 3 and implemented by no wave-A lane. POST /api/cvs/:cvId/regenerate → 202 { jobId }.

core/cv/merge.ts exists for exactly this and says so in its own header. Use it; do not write a second merge.

Acceptance:
- 202 with the job id; the CV goes back to generating; the job is enqueued through the same queue the intake path uses (C-005, ADR-004), not a second mechanism.
- Fields marked userEdited survive. A contract test sets one by hand, regenerates, and asserts it is unchanged while a non-edited sibling is replaced.
- 409 CONFLICT when a job for that CV is already in flight. The partial unique index enforces one non-terminal job per CV; the route answers 409 rather than letting the constraint surface as a 500.
- 404 NOT_FOUND for an unknown or another user's CV.
- Rate limiting is lane 08's global hook. Do not implement it here; do not contradict it.

Files: api/src/core/cv/*, api/src/routes/cvs.ts, tests/contract/cvs-regenerate*.

Read first: framework/docs/api-contracts.md C-010 and C-005, framework/docs/decisions.md ADR-004, api/src/core/cv/merge.ts.

Your tests enqueue non-terminal jobs, so they MUST go through openJobTestSuite().enqueue() in api/src/core/jobs/test-lock.ts (ADR-014, E-002) — a queued row committed without the suite lock gets stolen by another file's worker and looks like a flake.` },

'FIX-T-22': { lane: '09', kind: 'fix', title: 'The CV editor: seven corrected tests', brief:
`${D_EDITOR}

The editor itself is written and 30 of 37 tests pass. Do not rewrite it. Clear the seven, keep the other thirty green, and append the correction and its reason to the lane log.` },

'T-27': { lane: '09', kind: 'full', title: 'Questions beside the fields they ask about', brief:
`Spec F-005 and F-006, contract C-009. The editor now exists; this adds the product's one visual idea.

Acceptance:
- Each open question renders next to the field its path points at — the offsetTop + ResizeObserver alignment CVB-25 deliberately kept, because without it the pattern does not exist. On mobile the column collapses under the field it belongs to.
- Answering a question calls C-009 and re-renders only the section the answer changed. Nothing else on screen is replaced, and a userEdited field is never touched.
- Amber is questions and nothing else; red is errors only (framework/docs/design/design.json).
- A 409 (already answered) and a 503 (recompose failed, answer kept) are both shown truthfully. The 503 must not look like the answer was lost, because it was not.
- prefers-reduced-motion is honoured.

Files: web/src/features/cv/*, web/src/api/client* only.

Read first: framework/docs/spec.md §3.5, framework/docs/api-contracts.md C-009, framework/docs/design/design.json.

The API side is lane 07, in flight beside you. Code against C-009 as frozen, mock it at the client, never import from api/.` },

'FIX-T-25': { lane: '11', kind: 'fix', title: 'Job-queue guard: make it run', brief:
`${D_GUARD}

The helper itself (openJobTestSuite with enqueue + lock) was implemented and the lane gate was green. Lane 07 is importing it right now, so keep the module path and the exported names exactly as they are.` },
}

function lf(n) { return SPRINT + 'lanes/lane-' + n + '.md' }

function head(id, extra) {
  const t = TASKS[id]
  const lane = LANES[t.lane]
  return PREAMBLE +
    '\nLane file: ' + lf(t.lane) +
    '\nLane test command: ' + lane.test +
    '\nLane allowlist FILE: ' + lane.allow +
    '\n\n=== Task ' + id + ' — ' + t.title + ' ===\n\n' + t.brief + '\n' + (extra || '') + '\n\n'
}

function reviewPrompt(id, devReport, extra) {
  return 'You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + head(id, extra) +
    'The developer reported:\n' + devReport +
    '\n\nYour step: review against the acceptance criteria. Run the lane-scoped gate and check-lane.sh with your allowlist FILE yourself. Apply the stub-test lens and the adversarial lens. Do not fail the task for another lane\'s red or another lane\'s files. If you reject, put every blocking item in `fixes`, one per entry.'
}

async function reviewLoop(id, devReport, extra) {
  let review = await agent(reviewPrompt(id, devReport, extra), { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })

  if (review && !review.ok && (review.blockedOn === 'code' || review.blockedOn === 'none')) {
    const list = (review.fixes && review.fixes.length ? review.fixes.join('\n- ') : review.report)
    const fixed = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id, extra) +
      'The reviewer rejected this with a blocking fix-list:\n- ' + list +
      '\n\nYour step: clear every item, then re-run the lane-scoped gate. If an item is wrong, say which and why instead of silently skipping it.',
      { label: 'fix:' + id, phase: 'Fix', model: 'sonnet', schema: RESULT })
    review = await agent(reviewPrompt(id, devReport, extra) + '\n\nThis is a re-review. The fix pass reported:\n' + (fixed ? fixed.report : '(no report)') +
      '\nCheck only the fix-list items and whether anything regressed.',
      { label: 're-review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })
  }
  return review
}

async function runFix(id, priorReport) {
  const extra = '\nThe lane\'s own report from the blocked run:\n' + priorReport
  const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id, extra) +
    'Your step: the decision above unblocks you. Carry it out, then run the lane-scoped gate.',
    { label: 'dev:' + id, phase: 'Decide', model: 'sonnet', schema: RESULT })

  if (dev && !dev.ok && dev.blockedOn !== 'code') {
    log(id + ': still blocked on ' + dev.blockedOn + ' — back to the Orchestrator')
    return { id, lane: TASKS[id].lane, dev: false, review: false, blockedOn: dev.blockedOn, notes: dev.report }
  }
  const review = await reviewLoop(id, dev ? dev.report : '(no report)', extra)
  return { id, lane: TASKS[id].lane, dev: !!(dev && dev.ok), review: !!(review && review.ok), blockedOn: review ? review.blockedOn : 'none', notes: review ? review.report : 'no report' }
}

async function runTask(id) {
  const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + head(id) +
    'Your step: write the failing tests for the acceptance criteria above, and nothing else. No production code. Apply the stub-test rule: if a hard-coded happy value would pass your suite, the suite is decoration. Query elements the way a user finds them, and make every query unambiguous — an ambiguous getByRole inside a repeated structure is a defect in your test, not in the code. Report which assertions are red and why.',
    { label: 'tests:' + id, phase: 'Tests', model: 'haiku', schema: RESULT })

  let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
    'The test-engineer reported:\n' + (red ? red.report : '(no report)') +
    '\n\nYour step: make them green, then run the lane-scoped gate. Fixing a defective query or a mis-ordered setup in a test file is your job and is not weakening a test; deleting an assertion is.',
    { label: 'dev:' + id, phase: 'Code', model: 'haiku', schema: RESULT })

  if (dev && !dev.ok && dev.blockedOn === 'code') {
    dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
      'A cheaper model failed this. Its report:\n' + dev.report +
      '\n\nDiagnose the cause, fix it properly, get the lane-scoped gate green.',
      { label: 'dev-retry:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
  } else if (dev && !dev.ok) {
    log(id + ': blocked on ' + (dev.blockedOn || '?') + ' — not escalating, this one is the Orchestrator\'s')
    return { id, lane: TASKS[id].lane, dev: false, review: false, blockedOn: dev.blockedOn, notes: dev.report }
  }

  const review = await reviewLoop(id, dev ? dev.report : '(no report)')
  return { id, lane: TASKS[id].lane, dev: !!(dev && dev.ok), review: !!(review && review.ok), blockedOn: review ? review.blockedOn : 'none', notes: review ? review.report : 'no report' }
}

const PRIOR = {
  'FIX-T-21': 'Lane gate green, 49/49. Blocking: 8 tests in tests/contract/cvs-create.test.ts answer 429 where 201/400/413 are expected (one session user, beforeAll, more than 60 writes). jobs.test.ts passes. Non-blocking notes the reviewer also raised: check them in the lane log at ' + SPRINT + 'lanes/lane-08.md.',
  'FIX-T-22': 'Editor implemented in web/src/features/cv/ (route, editor, entries, fields, draft, types, trash-icon, cv.css). tsc and lint clean. 30 of 37 lane tests green; the 7 red are the ambiguous-role, unscoped-Location and 409-setup-ordering defects named in the decision above.',
  'FIX-T-25': 'Helper implemented in api/src/core/jobs/test-lock.ts (openJobTestSuite: enqueue takes the suite lock, lock(), holdsLock, release()). Lane gate green. The guard test at tests/guard/job-writes.guard.test.ts never runs: api/vitest.config.ts include does not match tests/guard/**.',
}

log('wave B, second pass: four decisions made, three lanes resume, two tasks still to run')

const done = await parallel([
  async () => {
    const out = [await runFix('FIX-T-21', PRIOR['FIX-T-21'])]
    if (!out[0].dev) { log('lane 08 did not land; lane 07 is not taking server.ts'); return out }
    for (const id of ['T-20', 'T-26']) {
      const r = await runTask(id)
      out.push(r)
      if (!r.dev) { log('lane 07: stopping the chain at ' + id); break }
    }
    return out
  },
  async () => {
    const out = [await runFix('FIX-T-22', PRIOR['FIX-T-22'])]
    if (!out[0].dev) return out
    out.push(await runTask('T-27'))
    return out
  },
  async () => [await runFix('FIX-T-25', PRIOR['FIX-T-25'])],
])

const tasks = done.filter(Boolean).flat()
return {
  tasks,
  green: tasks.filter(t => t.dev && t.review).map(t => t.id),
  needsAttention: tasks.filter(t => !t.dev || !t.review),
}
