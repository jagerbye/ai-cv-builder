// qa-fix-2.js — what lane C could not reach, and the error a failed CV cannot tell.

export const meta = {
  name: 'qa-fix-2',
  description: 'Finish the QA chrome fixes across the files lane C did not own, and surface a failed CV\'s error through C-006',
  phases: [{ title: 'Tests' }, { title: 'Code' }, { title: 'Review' }],
}

const BASE = 'HEAD'
const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const PREAMBLE = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder.',
  'Lane isolation: bash framework/scripts/check-lane.sh <base> <your allowlist FILE> (a FILE PATH, not globs). Another lane is working in this tree; its files are not your violations.',
  'GREEN MEANS YOUR LANE: GATE_LANE_TEST=\'<your lane test command>\' bash framework/scripts/gate.sh.',
  'export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.',
  'A suite that creates users deletes them in afterAll by the ids it collected — never by a name pattern or a time window (E-005). A test committing a non-terminal generation_jobs row enqueues through openJobTestSuite() (ADR-014).',
  'Every fix needs a test that fails without it.',
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

const LANES = {
  C2: { test: "npm -w web run test -- --run src", allow: SPRINT + 'allow/lane-C2.txt' },
  F: { test: "npm -w api run test -- --run src/core/cv src/core/jobs tests/contract/generation-persist tests/contract/cvs-read", allow: SPRINT + 'allow/lane-F.txt' },
}

const TASKS = {

'C2': { lane: 'C2', title: 'The three files lane C was not allowed to touch', brief:
`Lane C fixed QA-04 (the 503 no longer locks saving), QA-06 (textareas grow), QA-08 (native controls styled) and QA-11 (the icon is gone, "Delete" everywhere). It could not finish, because three files it needed belong to lane B's area, and lane B is done. They are yours now.

1. QA-07 (visual): "Log out" overlaps the brand on every signed-in screen, both viewports. The rule lives in web/src/app/shell.css. Lane C already wrote web/src/features/cv/shell-header.test.ts, which is red and expects the header to lay out without overlap. Make it pass by fixing the layout, not by changing what it asserts.

2. web/src/features/cv/list.css breaks the base two-track grid that web/src/styles/mobile-layout.test.ts asserts. Fix the list's own rule; mobile-layout.test.ts is the invariant and stays as it is.

3. web/src/features/cv/route.test.tsx:283 still asserts the old trash-icon treatment, which lane C deliberately removed (design.json's icons.rule, one icon in the product, and the icon was in Skills only while every other delete was a word). Update that assertion to the new treatment and say so in the report — a corrected test with the reason recorded, which the testing rule allows.

Then run the WHOLE web suite, not a subset: npm -w web run test -- --run src. It must be green. If anything else in web is red, it is yours to diagnose; say what you found even if you do not fix it.

Files: web/src/app/*, web/src/features/cv/*, web/src/styles/*.
Read first: ${SPRINT}qa-report.md (QA-07), framework/docs/design/design.json.` },

'F': { lane: 'F', title: 'A failed CV says why it failed', brief:
`ADR-017 (framework/docs/decisions.md, accepted — read it first).

QA-10 fixed the CV spinning forever: a terminal job failure now takes the CV to state \`failed\` in the same fenced write. What is still missing is the reason. C-006 carries no error and no job id, so the editor can tell a user their CV failed and cannot tell them why — on the most ordinary failure in this product, a missing ANTHROPIC_API_KEY, which is the owner's to fix and not theirs.

Acceptance:
- A CV in state \`failed\` carries \`lastError: { code, message }\` in C-006. Absent in every other state.
- \`code\` comes from the closed C-000 enum; \`message\` is the fixed safe message that already belongs to that code in api/src/http/errors.ts. Never a provider, driver or parser message, never prompt or source content. A test asserts that a thrown error's own text cannot reach the response.
- The CV's own columns hold it — written by the same transaction that sets state \`failed\` — not a join to generation_jobs, because a CV outlives its jobs. That needs a migration; follow the house style in api/prisma and framework/docs/database-schema.md, and update that doc in the same change.
- framework/docs/api-contracts.md C-006 documents the field.
- Tests per terminal path (classified failure, timeout, exhausted attempts) asserting the code that reaches C-006, plus one asserting a successful regeneration CLEARS it — a CV that succeeded must not still advertise last week's error.

Files: api/src/core/cv/*, api/src/core/jobs/*, api/prisma/*, tests/contract/generation-persist*, tests/contract/cvs-read*, framework/docs/*.
Do not touch web/ — the banner is the other lane's, and it codes against the contract.

Read first: framework/docs/decisions.md ADR-017, framework/docs/api-contracts.md C-006 and C-000, api/src/core/jobs/worker.ts, api/src/core/cv/persist.ts, api/src/core/cv/read.ts.` },
}

function head(id) {
  const t = TASKS[id]
  const lane = LANES[t.lane]
  return PREAMBLE +
    '\nLane: ' + t.lane + ' · lane file: ' + SPRINT + 'lanes/lane-' + t.lane + '.md' +
    '\nLane test command: ' + lane.test +
    '\nLane allowlist FILE: ' + lane.allow +
    '\n\n=== ' + id + ' — ' + t.title + ' ===\n\n' + t.brief + '\n\n'
}

async function runTask(id) {
  const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + head(id) +
    'Your step: write or identify the failing tests for the acceptance criteria, and nothing else. No production code.',
    { label: 'tests:' + id, phase: 'Tests', model: 'haiku', schema: RESULT })

  let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
    'The test-engineer reported:\n' + (red ? red.report : '(no report)') +
    '\n\nYour step: make them green, then run the lane-scoped gate.',
    { label: 'dev:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })

  if (dev && !dev.ok && dev.blockedOn !== 'code') {
    log(id + ': blocked on ' + dev.blockedOn)
    return { id, dev: false, review: false, blockedOn: dev.blockedOn, notes: dev.report }
  }

  const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + head(id) +
    'The developer reported:\n' + (dev ? dev.report : '(no report)') +
    '\n\nYour step: review against the acceptance criteria. Run the lane-scoped gate and check-lane yourself. For each item, say how you confirmed it. Apply the stub-test lens.',
    { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })

  return { id, dev: !!(dev && dev.ok), review: !!(review && review.ok), blockedOn: review ? review.blockedOn : 'none', notes: review ? review.report : 'no report' }
}

const done = await parallel(['C2', 'F'].map(id => () => runTask(id)))
return { tasks: done.filter(Boolean), needsAttention: done.filter(Boolean).filter(t => !t.dev || !t.review) }
