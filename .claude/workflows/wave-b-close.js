// wave-b-close.js — the last three pieces of wave B.
//
// T-20 is written and green; the only open item was whether bumping the CV's
// version violates C-009. ADR-015 says it does not and the contract now says
// so, so this is a test that pins the bump, not a rewrite.
//
// T-26's red case exposed scope nobody wrote down: the worker runs the whole
// pipeline and persists none of it. That is T-28, and T-26 cannot pass before
// it lands — so they are one chain.

export const meta = {
  name: 'wave-b-close',
  description: 'Pin the version bump (ADR-015), make the worker persist what it generates and start it, then finish regenerate',
  phases: [
    { title: 'Tests' }, { title: 'Code' }, { title: 'Review' }, { title: 'Fix' },
  ],
}

const BASE = 'c2530e6'
const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const PREAMBLE = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder. Sprint: ' + SPRINT,
  'Lane isolation: bash framework/scripts/check-lane.sh ' + BASE + ' <your allowlist FILE>. The second argument is a FILE PATH, not a list of globs. Your allowlist file is named below and already exists.',
  'Other lanes have approved but uncommitted work in this same tree — api/src/http/**, api/src/routes/**, web/src/features/cv/**, tests/guard/**. check-lane will show you those files. They are not your violations: judge only the paths your own allowlist covers.',
  'GREEN MEANS YOUR LANE. Run the gate as: GATE_LANE_TEST=\'<your lane test command>\' bash framework/scripts/gate.sh. Never run the root test command.',
  'Tests need the database: export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.',
  'A test that commits a non-terminal generation_jobs row MUST enqueue it through openJobTestSuite().enqueue() in api/src/core/jobs/test-lock.ts — it takes the suite lock for you (ADR-014, E-002), and a guard test at tests/guard/job-writes.guard.test.ts now fails any file that writes such a row directly.',
  'If you are still blocked, set blockedOn and say why rather than improvising. Do not write yourself an ADR.',
  'Jira is virtual (board.md, ADR-009). Never commit; the Orchestrator commits. Report at most 30 lines.',
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

const LANES = {
  '07': { test: "npm -w api run test -- --run src/core/cv tests/contract/cvs-answer tests/contract/cvs-regenerate",
          allow: SPRINT + 'allow/lane-07.txt' },
  '12': { test: "npm -w api run test -- --run src/core/jobs tests/contract/generation-persist tests/contract/cvs-regenerate",
          allow: SPRINT + 'allow/lane-12.txt' },
}

const TASKS = {

'FIX-T-20': { lane: '07', kind: 'fix', title: 'Pin the version bump', brief:
`DECISION (Architect — ADR-015, written and accepted):

Your implementation bumps the CV's top-level \`version\` on a successful answer, and you were right to flag it against C-009's "everything else is unchanged". It stays, and the contract now says so (framework/docs/api-contracts.md C-009, framework/docs/decisions.md ADR-015). \`version\` is C-008's optimistic-concurrency token, not content: a section that changed under a still version is a section an open editor overwrites with stale data, which is the lost update C-008 exists to prevent.

Your step, and nothing more:
- Add a contract test that asserts the bump — read the CV, answer a question, assert \`version\` is strictly greater, and assert in the same test that the untouched sections and every userEdited field are still identical. The second half already exists; the assertion that is missing is the one that would let a future implementation quietly drop the bump.
- Cover the edge case the reviewer named and you left untested: a question whose bound item no longer exists. Today the answer is stored and 200 is returned with no section change. Assert exactly that, so the behaviour is a decision rather than an accident.
- Append the lane report to ${SPRINT}lanes/lane-07.md, including the reviewer's note that compose() has no section scope, so a "section-scoped recompose" costs a full-CV call today. That is a real limit of C-012 and belongs in writing.

Do not change answer.ts's behaviour. Do not touch api/src/server.ts — lane 12 is editing it right now.` },

'T-28': { lane: '12', kind: 'full', title: 'The worker persists what it generates, and the app starts it', brief:
`Scope nobody wrote down, found by T-26's regenerate test (CVB-31).

api/src/core/jobs/worker.ts runs extract → compose → verify and then writes only the job row. Its own comment says "The verified result is persisted by core/cv, the owner of CV content" — and core/cv has no such function. Nothing in api/src/main.ts starts the worker either. So this product has never stored a generated CV: every green test so far asserted the job row, the pipeline, or a draft handed straight to an assertion.

Acceptance:
- A new api/src/core/cv/persist.ts writes a verified draft to the CV's items: contact, summary, experience entries with their bullets, education, skills, and the QUESTIONS the verifier produced — the editor reads questions from the C-006 shape, so a draft stored without them is a half-stored draft.
- userEdited items survive. Use mergeRegenerated from api/src/core/cv/merge.ts; do not write a second merge. A first generation has nothing stored, so the merge is a no-op there and the same code path serves both.
- The write and the job's success write are ONE transaction, and the fence stays: the job row update must still match (id, attempt, status='running'), and if it matches no row the whole transaction rolls back. A worker that lost its lease must not leave a persisted draft behind from a run a successor now owns. This is the part a careless implementation gets wrong, and the test for it is the task's centre: stop the worker mid-run, let a successor finish, assert exactly one draft was stored and it is the successor's.
- The CV's state reaches 'ready' on success and the version bumps (ADR-015 — same reasoning as the answer path).
- api/src/main.ts starts the worker: a poll loop with a modest interval, graceful stop on SIGTERM/SIGINT so an in-flight run is not torn mid-transaction. It starts whether or not ANTHROPIC_API_KEY is set — F-010 requires the app to boot without it, and the gateway already classifies the missing key so the job fails with a clear code instead of the process crashing.
- The real pipeline factory: lane 07 wired buildServer({ generationPipeline }) with a default. If that construction sits inline in api/src/server.ts, extract it to api/src/core/generation/pipeline.ts and have BOTH server.ts and main.ts import it — the worker and the HTTP path must not build two different pipelines. server.ts is on your allowlist for exactly this; change nothing else in it.
- A contract test at tests/contract/generation-persist* drives it end to end with the pipeline mocked at the C-012 seam: enqueue, run the worker, read the CV through C-006, and assert the stored content matches what compose produced, with a userEdited field preserved across a second run.

Files: api/src/core/jobs/*, api/src/core/cv/persist*, api/src/core/generation/pipeline*, api/src/server.ts (the extraction only), api/src/main.ts, tests/contract/generation-persist*.

Read first: api/src/core/jobs/worker.ts, api/src/core/cv/merge.ts, framework/docs/api-contracts.md C-005 and C-006, framework/docs/decisions.md ADR-004 and ADR-015, framework/docs/spec.md §3.3 and §3.6.

Do NOT touch api/src/core/cv/answer.ts or tests/contract/cvs-answer* — lane 07 is in them right now.` },

'FIX-T-26': { lane: '07', kind: 'fix', title: 'Regenerate, now that something persists', brief:
`Your regenerate implementation was 12 of 13 green. The one red case — "Old Employer" still present after the worker runs — was not your defect: nothing persisted the verified draft. T-28 has just landed api/src/core/cv/persist.ts and wired the worker to it.

Your step:
- Re-run your lane gate. The merge case should now pass; if it does not, say precisely what the stored CV contains versus what you asserted — that is a real finding about the persist path, not something to work around by relaxing the assertion.
- Keep the FIFO loop you added to reach your own job id, but make it honest: a comment saying the worker claims across the whole queue, so the test drains until it sees its own id.
- Append the lane report to ${SPRINT}lanes/lane-07.md: what regenerate does, the 409 path through the partial unique index, and the fact that the CV state is unchanged on 409 because the transaction rolls back.

Files: api/src/core/cv/*, api/src/routes/cvs.ts, tests/contract/cvs-regenerate*. Do not touch the worker or persist.ts — lane 12 owns them.` },
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

function reviewPrompt(id, devReport) {
  return 'You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + head(id) +
    'The developer reported:\n' + devReport +
    '\n\nYour step: review against the acceptance criteria. Run the lane-scoped gate and check-lane.sh with your allowlist FILE yourself. Apply the stub-test lens and the adversarial lens. Do not fail the task for another lane\'s red or another lane\'s files. If you reject, put every blocking item in `fixes`, one per entry.'
}

async function reviewLoop(id, devReport) {
  let review = await agent(reviewPrompt(id, devReport), { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })
  if (review && !review.ok && (review.blockedOn === 'code' || review.blockedOn === 'none')) {
    const list = (review.fixes && review.fixes.length ? review.fixes.join('\n- ') : review.report)
    const fixed = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
      'The reviewer rejected this with a blocking fix-list:\n- ' + list +
      '\n\nYour step: clear every item, then re-run the lane-scoped gate. If an item is wrong, say which and why instead of silently skipping it.',
      { label: 'fix:' + id, phase: 'Fix', model: 'sonnet', schema: RESULT })
    review = await agent(reviewPrompt(id, devReport) + '\n\nThis is a re-review. The fix pass reported:\n' + (fixed ? fixed.report : '(no report)') +
      '\nCheck only the fix-list items and whether anything regressed.',
      { label: 're-review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })
  }
  return review
}

async function runTask(id) {
  const t = TASKS[id]
  let dev
  if (t.kind === 'full') {
    const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + head(id) +
      'Your step: write the failing tests for the acceptance criteria above, and nothing else. No production code. Apply the stub-test rule. The lease-loss test is the one that matters most — write it so a persist that ignores the fence actually fails it. Report which assertions are red and why.',
      { label: 'tests:' + id, phase: 'Tests', model: 'haiku', schema: RESULT })
    dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
      'The test-engineer reported:\n' + (red ? red.report : '(no report)') +
      '\n\nYour step: make them green, then run the lane-scoped gate.',
      { label: 'dev:' + id, phase: 'Code', model: 'haiku', schema: RESULT })
    if (dev && !dev.ok && dev.blockedOn === 'code') {
      dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
        'A cheaper model failed this. Its report:\n' + dev.report +
        '\n\nDiagnose the cause, fix it properly, get the lane-scoped gate green.',
        { label: 'dev-retry:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
    }
  } else {
    dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
      'Your step: carry out the brief above, then run the lane-scoped gate.',
      { label: 'dev:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
  }

  if (dev && !dev.ok && dev.blockedOn !== 'code') {
    log(id + ': blocked on ' + dev.blockedOn + ' — back to the Orchestrator')
    return { id, lane: t.lane, dev: false, review: false, blockedOn: dev.blockedOn, notes: dev.report }
  }

  const review = await reviewLoop(id, dev ? dev.report : '(no report)')
  return { id, lane: t.lane, dev: !!(dev && dev.ok), review: !!(review && review.ok), blockedOn: review ? review.blockedOn : 'none', notes: review ? review.report : 'no report' }
}

log('closing wave B: the version bump, the missing persist, and regenerate behind it')

const done = await parallel([
  async () => [await runTask('FIX-T-20')],
  async () => {
    const out = [await runTask('T-28')]
    if (!out[0].dev) { log('T-28 did not land; regenerate cannot be finished behind it') ; return out }
    out.push(await runTask('FIX-T-26'))
    return out
  },
])

const tasks = done.filter(Boolean).flat()
return {
  tasks,
  green: tasks.filter(t => t.dev && t.review).map(t => t.id),
  needsAttention: tasks.filter(t => !t.dev || !t.review),
}
