// wave-b.js — the five lanes that finish the product.
//
// Same shape as wave A: lanes are disjoint file sets, each lane runs its tasks
// in order, all lanes run at once. Two seams keep them apart — server.ts
// belongs to lane 08 alone (so rate limiting is one global hook, not an edit in
// five route files), and lane 11 keeps test-lock.ts's module path and export
// stable while lane 07 writes tests that import it (ADR-014).

export const meta = {
  name: 'wave-b',
  description: 'Wave B: answer and regenerate, hardening, the CV editor with inline questions, README, and the job-queue test helper',
  phases: [
    { title: 'Tests' }, { title: 'Code' }, { title: 'Review' }, { title: 'Fix' },
  ],
}

const BASE = 'e65f3b9'
const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const PREAMBLE = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder. Sprint: ' + SPRINT,
  'Base ref for check-lane.sh: ' + BASE + '. Commits before it are wave A and are not your lane.',
  'ALWAYS ALLOWED, in addition to the files your task names: your own lane log, plan.md, and any doc the docs-sync rule requires for a change you actually made. Judging a lane for touching those is a false failure.',
  'GREEN MEANS YOUR LANE. Four other lanes are editing this same tree right now. Run the gate as: GATE_LANE_TEST=\'<your lane test command>\' bash framework/scripts/gate.sh — it then runs database + lint + your tests, which is the whole definition of green for you. NEVER run the root test command, and never report red for a failure in a file your task does not own; the Integrator runs the union afterwards.',
  'Tests need the database: export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand. The gate does this for you; a bare vitest run does not.',
  'If your blocker is a decision, a missing dependency, or a rule the frozen contracts cannot express, STOP and say so plainly in your report with blockedOn set. Do not improvise, and do not write yourself an ADR — ADRs are the architect\'s. "Blocked, and here is exactly why" is a successful step, not a failed one.',
  'Jira is virtual (board.md, ADR-009). Never commit; the Orchestrator commits.',
  'Report at most 30 lines.',
].join('\n')

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 30 lines' },
    fixes: { type: 'array', items: { type: 'string' }, description: 'reviewer only: the blocking fix-list, one item per line' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const LANES = {
  '07': { test: "npm -w api run test -- --run src/core/cv tests/contract/cvs-answer tests/contract/cvs-regenerate",
          allow: 'api/src/core/cv/**, api/src/routes/cvs.ts, tests/contract/cvs-answer*, tests/contract/cvs-regenerate*' },
  '08': { test: "npm -w api run test -- --run src/http src/routes tests/contract/hardening",
          allow: 'api/src/http/**, api/src/server.ts, api/src/routes/auth.ts, api/src/routes/cvs-create.ts, api/src/routes/jobs.ts, api/src/routes/export.ts, tests/contract/hardening*' },
  '09': { test: "npm -w web run test -- --run src/features/cv src/api",
          allow: 'web/src/features/cv/**, web/src/api/client.ts, web/src/api/client.test.ts' },
  '10': { test: "npm -w api run test -- --run src/routes/health",
          allow: 'README.md' },
  '11': { test: "npm -w api run test -- --run src/core/jobs tests/guard tests/contract/jobs",
          allow: 'api/src/core/jobs/**, tests/guard/**, tests/contract/jobs.test.ts, tests/contract/cvs-create.test.ts' },
}

const TASKS = {

'T-20': { lane: '07', title: 'Answer a question → user fact → section-scoped recompose', brief:
`Contract C-009, spec F-005 and F-006. POST /api/cvs/:cvId/questions/:questionId/answer.

The verifier (T-12) already produces questions; the CV read shape (C-006) already carries them; core/cv/merge.ts already knows how a regenerated section meets userEdited fields. Nothing here needs a new idea — it needs the three to meet.

Acceptance:
- The answer is stored as a USER-SOURCED fact. A user fact is trusted: it bypasses the groundedness verifier by design (F-006), and it is available to the recompose as a fact like any other.
- Only the section owning the question's path is recomposed. The response is the full C-006 shape and a contract test asserts that every other section, and every userEdited field anywhere, is byte-identical to what it was before the call. This assertion is the task.
- The question is marked answered. Answering it twice returns 409 CONFLICT. An unknown cvId or questionId returns 404 NOT_FOUND — another user's CV is a 404, never a 403.
- If the targeted recompose fails, the answer is STILL stored and the question still counts as answered; the call returns 503 LLM_UNAVAILABLE. Prove it with a test that makes the pipeline throw.
- The LLM is mocked at the C-012 seam, as everywhere else. No network, no API key.

Files you may touch: api/src/core/cv/answer*, api/src/core/cv/types.ts (only if C-006 needs a field for an answered question — if it does, STOP and report it as a decision, the contract is frozen), api/src/routes/cvs.ts, tests/contract/cvs-answer*.

Read first: framework/docs/api-contracts.md C-009 and C-006, framework/docs/spec.md §3.5 and §3.6, framework/docs/decisions.md ADR-002 and ADR-013.

If a test of yours commits a non-terminal generation_jobs row, take the suite lock through api/src/core/jobs/test-lock.ts (ADR-014, E-002). Do not edit that file — lane 11 owns it and is keeping its path and its acquireJobSuiteLock export stable for you.` },

'T-26': { lane: '07', title: 'Regenerate', brief:
`Contract C-010, frozen in sprint 3 and implemented by no wave-A lane. POST /api/cvs/:cvId/regenerate → 202 { jobId }.

core/cv/merge.ts exists for exactly this and says so in its own header comment. Use it; do not write a second merge.

Acceptance:
- 202 with the job id; the CV goes back to generating; a job row is enqueued through the same queue the intake path uses (C-005, ADR-004) — not a second mechanism.
- Fields marked userEdited survive the regeneration. A contract test sets one by hand, regenerates, and asserts it is unchanged while a non-edited sibling is replaced.
- 409 CONFLICT when a job for that CV is already in flight. The partial unique index already enforces one non-terminal job per CV; the route must answer 409 rather than letting the constraint surface as a 500.
- 404 NOT_FOUND for an unknown or another user's CV.
- 429 RATE_LIMITED is lane 08's hook, not yours. Do not implement rate limiting here; just do not contradict it.

Files you may touch: api/src/core/cv/regenerate*, api/src/routes/cvs.ts, tests/contract/cvs-regenerate*.

Read first: framework/docs/api-contracts.md C-010 and C-005, framework/docs/decisions.md ADR-004, api/src/core/cv/merge.ts.

Your tests enqueue non-terminal jobs, so they MUST take the suite lock through api/src/core/jobs/test-lock.ts (ADR-014, E-002) — a test that commits a queued row without it will be robbed by another suite's worker and will look like a flake. Do not edit that file; lane 11 owns it.` },

'T-21': { lane: '08', title: 'Hardening: rate limits, the envelope installed, one session guard', brief:
`Spec F-010 and contract C-000. Three defects, all of them cross-cutting, which is why they are one lane.

1. THE ENVELOPE IS WRITTEN BUT NOT INSTALLED. api/src/http/errors.ts defines installErrorEnvelope and server.ts never calls it. Unhandled throws and unmatched paths therefore answer with Fastify's default body — which is exactly the leak F-010 forbids. Install it on the /api context, and assert with tests: an unmatched path under /api returns the envelope with NOT_FOUND, and a handler that throws returns 500 INTERNAL with no stack, no provider message and no request content anywhere in the body.

2. TWO ROUTES HAND-ROLL THE SESSION. api/src/routes/jobs.ts and api/src/routes/cvs-create.ts each carry their own cookie parse and session lookup, with a comment saying the auth lane should replace it. Replace it: both go through requireUser (api/src/http/requireUser.ts, ADR-007). Behaviour must not change — 401 with the UNAUTHENTICATED envelope, ownership still answered as 404. The existing contract tests for those routes must pass untouched; if one needs changing, that is a finding, so STOP and report it rather than editing it. tests/contract/jobs.test.ts and tests/contract/cvs-create.test.ts belong to lane 11 this wave.

3. RATE LIMITS DO NOT EXIST. Per F-010: 10 generations per hour per user, 60 writes per minute per user; exceeding either returns 429 RATE_LIMITED with a Retry-After header. Implement it as ONE global hook registered in server.ts, keyed by the session user — not as an edit in each route file, because four other lanes own those files. A generation is a request that enqueues a job (create and regenerate); a write is any POST/PATCH/DELETE under /api. Unauthenticated requests are keyed by nothing and are not counted — auth brute-force is out of scope for this task, do not invent it.

Counters: in-process is acceptable for a single-container deployment, but say so in the report and in architecture.md, and make the window real (a sliding or fixed window with a tested boundary), not a counter that never resets. A test proves the 11th generation in an hour is 429 with Retry-After, and that the clock advancing frees it — inject the clock, never sleep.

Files you may touch: api/src/http/**, api/src/server.ts, api/src/routes/auth.ts, api/src/routes/cvs-create.ts, api/src/routes/jobs.ts, api/src/routes/export.ts, tests/contract/hardening*.

Do NOT touch api/src/routes/cvs.ts (lane 07), web/** (lane 09), or the job test suites (lane 11).

Read first: framework/docs/spec.md §3.10, framework/docs/api-contracts.md C-000, framework/docs/decisions.md ADR-007, api/src/http/errors.ts.` },

'T-22': { lane: '09', title: 'The CV editor', brief:
`Spec F-006, contracts C-006 and C-008. Today web/src/features/cv/route.tsx is an empty state and nothing else.

Acceptance:
- The CV is fetched and rendered: contact details, summary, experience entries (employer, role, period, bullets), education entries, skills.
- Every field the generator can write, the user can edit in place. The user can add, delete and reorder experience entries, education entries, skills and bullets.
- Saving is a PATCH carrying the version from the last read (C-008). A 409 is shown as a real message telling the user the CV changed elsewhere and offering to reload — not a toast that loses their text, and not a silent retry that overwrites the other device.
- Edits save without a page navigation and survive a reload.
- Mobile at 375px and desktop at 1440px both work. Follow framework/docs/design/design.json — it is the source of truth for colour, type and spacing, and its icons.rule caps the icon set at the single trash icon. Text, not icons, for everything else.
- Tests use the real modules against a mocked fetch; assert concrete rendered values and at least one error case per criterion.

Files you may touch: web/src/features/cv/**, web/src/api/client.ts and its test.

Read first: framework/docs/spec.md §3.6, framework/docs/api-contracts.md C-006 and C-008, framework/docs/design/design.json and its README.

Do not touch web/src/app/** — the shell and the router are T-05's and the route module for /cvs already exists and is already registered.` },

'T-27': { lane: '09', title: 'Questions beside the fields they ask about', brief:
`Spec F-005 and F-006, contract C-009. The editor from T-22 now exists; this adds the product's one visual idea.

Acceptance:
- Each open question is rendered next to the field its path points at — the question-column alignment (offsetTop plus a ResizeObserver) that CVB-25 deliberately kept, because without it the pattern does not exist. On mobile the column collapses under the field it belongs to.
- Answering a question calls C-009 and re-renders the section the answer changed; nothing else on screen is replaced, and a field the user has edited is not touched.
- Amber is used for questions and for nothing else; red is errors only (design.json).
- A 409 from the answer endpoint (already answered) and a 503 (recompose failed, answer kept) are both shown truthfully. The 503 case must not look like the answer was lost, because it was not.
- prefers-reduced-motion is honoured.

Files you may touch: web/src/features/cv/**, web/src/api/client.ts and its test.

Read first: framework/docs/spec.md §3.5, framework/docs/api-contracts.md C-009, framework/docs/design/design.json.

The API side is lane 07, in flight beside you. Code against C-009 as frozen, mock it at the client, and never import anything from api/.` },

'T-23': { lane: '10', title: 'README', brief:
`Backlog B-020. The README at the repo root still opens with "Status: planned, not yet built", says Node 22, and advertises an npm run test:e2e script that does not exist in package.json. Every one of those is now false. The brief this project answers evaluates the README, so it is a deliverable, not housekeeping.

Acceptance — every claim in the file is one you verified by running it:
- Running it: the exact commands a clean clone needs, in order, each one run by you. If docker compose up is not enough on a clean clone, the README says what else is needed. Node 24 (ADR-012), not 22.
- Tests: the commands that actually exist. Run them, report what they print.
- Architecture in one screen, and the anti-hallucination design in its own section: extract with verbatim quotes, compose that never sees the source text, deterministic verify, co-occurrence over citation (ADR-002, ADR-013). This is what the task is really being judged on — explain the mechanism, not the intention.
- What was cut and why, and an honest "how AI was used" section.
- No forward-looking claims. If something is not built, the README says it is not built.

Files you may touch: README.md. Nothing else — if a command fails because of a defect elsewhere, that is a finding: report it with blockedOn, do not fix it from here.

Read first: framework/docs/architecture.md, framework/docs/decisions.md ADR-002/012/013, framework/docs/spec.md §1-2, package.json.

You have no lane tests. Your evidence is the transcript of the commands you ran, in your report.` },

'T-25': { lane: '11', title: 'Job-queue test helper and its guard', brief:
`ADR-014 and errors.md E-002. The queue is global by design, so any test that commits a non-terminal generation_jobs row can have it stolen by another file's worker running in parallel. Four suites avoid this by remembering to call acquireJobSuiteLock. The lane that forgets will not see it fail — it surfaces only in the union, at integration, as a flake.

Acceptance:
- api/src/core/jobs/test-lock.ts gains a helper that enqueues a job for a test AND takes the suite lock itself, so the lock cannot be forgotten by anyone who uses it. Keep the module path and the existing acquireJobSuiteLock export exactly as they are: lane 07 is importing them right now.
- A guard test fails any test file that writes a non-terminal generation_jobs row without going through the helper — a grep-shaped assertion over the test sources, so it also catches the next suite that hand-rolls an INSERT or a prisma.generationJob.create. It must name the offending file in its failure message. Prove it catches something: add a fixture string the guard rejects, assert the detector rejects it, and do not leave a real violating file behind.
- The four existing suites (api/src/core/jobs/jobs.test.ts, api/src/core/jobs/boundaries.test.ts, tests/contract/jobs.test.ts, tests/contract/cvs-create.test.ts) go through the helper and still pass.
- Do not disable file parallelism and do not add a serial vitest project — ADR-014 measured both and rejected them (12.5s against 4.0s on the hottest loop in the project).

Files you may touch: api/src/core/jobs/**, tests/guard/**, tests/contract/jobs.test.ts, tests/contract/cvs-create.test.ts.

Read first: framework/docs/decisions.md ADR-014, framework/knowledge/errors.md E-002, framework/docs/testing-strategy.md, api/src/core/jobs/test-lock.ts.

Lane 07 is writing new job tests against your helper while you work. If you change its shape, say so loudly in the report — it is the one cross-lane seam in this wave.` },
}

function lf(n) { return SPRINT + 'lanes/lane-' + n + '.md' }

async function runTask(id) {
  const t = TASKS[id]
  const lane = LANES[t.lane]
  const head = PREAMBLE +
    '\nLane file: ' + lf(t.lane) +
    '\nLane test command: ' + lane.test +
    '\nLane allowlist: ' + lane.allow +
    '\n\n=== Task ' + id + ' — ' + t.title + ' ===\n\n' + t.brief + '\n\n'

  const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + head +
    'Your step: write the failing tests for the acceptance criteria above, and nothing else. No production code. Apply the stub-test rule: if a hard-coded happy value would pass your suite, the suite is decoration. Report which assertions are red and why.',
    { label: 'tests:' + id, phase: 'Tests', model: 'haiku', schema: RESULT })

  let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head +
    'The test-engineer reported:\n' + (red ? red.report : '(no report)') +
    '\n\nYour step: make them green, then run the lane-scoped gate. Fixing a type error in a test file is your job and is not weakening a test. Weakening or deleting an assertion to go green is not.',
    { label: 'dev:' + id, phase: 'Code', model: 'haiku', schema: RESULT })

  // FF-11: only a capability failure earns a stronger model. A decision, a
  // dependency or a defective brief comes back to the Orchestrator instead.
  if (dev && !dev.ok && dev.blockedOn === 'code') {
    dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head +
      'A cheaper model failed this. Its report:\n' + dev.report +
      '\n\nDiagnose the cause, fix it properly, get the lane-scoped gate green.',
      { label: 'dev-retry:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
  } else if (dev && !dev.ok) {
    log(id + ': blocked on ' + (dev.blockedOn || '?') + ' — not escalating, this one is the Orchestrator\'s')
    return { id, lane: t.lane, dev: false, review: false, blockedOn: dev.blockedOn, notes: dev.report }
  }

  const reviewPrompt = 'You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + head +
    'The developer reported:\n' + (dev ? dev.report : '(no report)') +
    '\n\nYour step: review against the acceptance criteria. Run the lane-scoped gate and bash framework/scripts/check-lane.sh ' + BASE + ' <allowlist> yourself. Apply the stub-test lens and the adversarial lens. Do not fail the task for another lane\'s red, or for the always-allowed files. If you reject, put every blocking item in `fixes`, one per entry — a fix-list that is only prose gets lost.'

  let review = await agent(reviewPrompt, { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })

  // FF-01: a reviewer's fix-list is acted on, not recorded and forgotten.
  if (review && !review.ok && (review.blockedOn === 'code' || review.blockedOn === 'none')) {
    const list = (review.fixes && review.fixes.length ? review.fixes.join('\n- ') : review.report)
    const fixed = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head +
      'The reviewer rejected this with a blocking fix-list:\n- ' + list +
      '\n\nYour step: clear every item, then re-run the lane-scoped gate. If an item is wrong, say which and why instead of silently skipping it.',
      { label: 'fix:' + id, phase: 'Fix', model: 'sonnet', schema: RESULT })
    review = await agent(reviewPrompt + '\n\nThis is a re-review. The fix pass reported:\n' + (fixed ? fixed.report : '(no report)') +
      '\nCheck only the fix-list items and whether anything regressed. Do not open new ground that the first review passed.',
      { label: 're-review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })
  }

  return {
    id, lane: t.lane,
    dev: !!(dev && dev.ok),
    review: !!(review && review.ok),
    blockedOn: review ? review.blockedOn : 'none',
    notes: review ? review.report : 'no report',
  }
}

log('wave B: five lanes — answer/regenerate, hardening, the editor, README, the queue helper')

const CHAINS = [['T-20', 'T-26'], ['T-21'], ['T-22', 'T-27'], ['T-23'], ['T-25']]

const done = await parallel(CHAINS.map(chain => async () => {
  const out = []
  for (const id of chain) {
    const r = await runTask(id)
    out.push(r)
    if (!r.dev) { log(chain.join(' → ') + ': stopping the chain at ' + id); break }
  }
  return out
}))

const tasks = done.filter(Boolean).flat()
return {
  tasks,
  green: tasks.filter(t => t.dev && t.review).map(t => t.id),
  needsAttention: tasks.filter(t => !t.dev || !t.review),
}
