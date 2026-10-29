// qa-fix.js — the QA pass found four blockers and six lesser findings.
// Five disjoint lanes; the sprint cannot close over an open blocker.

export const meta = {
  name: 'qa-fix',
  description: 'Fix the QA blockers: no api route from the browser, no front door, a list that never loads, a 503 that locks saving; plus question paths, clipped text and the chrome',
  phases: [{ title: 'Tests' }, { title: 'Code' }, { title: 'Review' }, { title: 'Fix' }],
}

const BASE = 'fa1df48'
const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const PREAMBLE = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder.',
  'The QA report is ' + SPRINT + 'qa-report.md and its screenshots are in ' + SPRINT + 'qa-screenshots/. Read your own findings there before you start; the report has the repro steps and the evidence.',
  'Lane isolation: bash framework/scripts/check-lane.sh ' + BASE + ' <your allowlist FILE> (a FILE PATH, not globs). Four other lanes are working in this tree; their files are not your violations.',
  'GREEN MEANS YOUR LANE: GATE_LANE_TEST=\'<your lane test command>\' bash framework/scripts/gate.sh. Never run the root test command.',
  'export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.',
  'The stack is up: web http://127.0.0.1:5273, api http://127.0.0.1:3000, db on 5432. There is no ANTHROPIC_API_KEY and that is deliberate.',
  'A test that commits a non-terminal generation_jobs row goes through openJobTestSuite().enqueue() (ADR-014). A suite that creates users deletes them by ID in afterAll — by the ids it collected, never by a name pattern or a time window (E-005).',
  'Every fix needs a test that fails without it. A QA finding with no regression test is a finding that comes back.',
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
  A: { test: "npm -w web run test -- --run src/index src/toolchain", allow: SPRINT + 'allow/lane-A.txt' },
  B: { test: "npm -w web run test -- --run src/app src/features/auth src/features/cv/route", allow: SPRINT + 'allow/lane-B.txt' },
  C: { test: "npm -w web run test -- --run src/features/cv src/styles", allow: SPRINT + 'allow/lane-C.txt' },
  D: { test: "npm -w api run test -- --run src/core/generation/verify src/core/generation/questions", allow: SPRINT + 'allow/lane-D.txt' },
  E: { test: "npm -w api run test -- --run src/core/jobs tests/contract/generation-persist", allow: SPRINT + 'allow/lane-E.txt' },
}

const TASKS = {

'QA-01': { lane: 'A', title: 'The browser must be able to reach the api', brief:
`BLOCKER. The shipped web container has no route to the api. web/vite.config.ts declares no proxy, web/Dockerfile runs a bare \`vite preview\`, and docker-compose.yml has no reverse proxy. So every GET /api/* from a browser is answered by the SPA's own HTML with 200, every POST returns 404, and nobody can sign in. The whole product is unusable in a browser while 691 tests are green, because the api suites call the server in-process and the web suites mock fetch.

Acceptance:
- A browser loading the app on the host port reaches the api on the SAME origin. Choose the mechanism and say why in the report: vite's \`preview.proxy\` (and \`server.proxy\` for \`vite dev\`, so the two agree), or a reverse proxy in compose. Prefer the smallest change that works in BOTH \`npm run dev\` and the composed stack, and do not hard-code a hostname that only resolves inside Docker — the target differs between the two, so it comes from an environment variable with a sane default.
- A smoke test proves it, and it is the point of this task: start nothing, assume the stack is up, and assert over real HTTP on the host port that the SPA is served, that /api/health answers JSON (not HTML) through the web origin, and that a register-then-login round trip through the web origin sets a session cookie. Put it in tests/smoke/ with its own vitest config entry, and make it SKIP with a clear message when the stack is not up, so it never turns the gate red on a machine with nothing running.
- Add it to framework/scripts/gate.config.sh as a full-gate step only. It must NOT run in wave mode (the .wave-in-flight branch) — it is slow and needs containers.
- framework/docs/architecture.md gains the line nobody owned: how the browser reaches the api, in one paragraph, naming the mechanism you chose.
- README's "Running it" is verified again against a rebuilt stack, and says the host port.

Prove it end to end: docker compose build && docker compose up -d --wait, then curl the web origin for /api/health and show the JSON in your report, then run your smoke test and show it pass.

Files: web/vite.config.ts, web/Dockerfile, docker-compose.yml, .env.example, README.md, tests/smoke/*, framework/scripts/*.` },

'QA-02': { lane: 'B', title: 'The front door, the list, and where sign-in sends you', brief:
`Three findings, all in routing, all blockers or close to it.

QA-02 (blocker): http://127.0.0.1:5273/ renders "Page not found". web/src/app/routes.ts declares /auth/*, /cvs/new, /jobs/:jobId and /cvs/* and nothing for "/". The first thing a visitor sees is a 404. Give "/" a route: signed out it lands on sign-in, signed in it lands on the CV list. Say in the report which it does and why.

QA-03 (blocker): /cvs always renders "You have no CVs yet." It never calls GET /api/cvs — which works and returns the user's CVs. So after signing in there is nowhere to go: the editor is reachable only by pasting an id into the address bar. Fetch the list, render it (title, target role, state, updated), link each row to its editor, and keep a real empty state for a user who genuinely has none. A failed load says so; it does not silently claim the list is empty — that is exactly the bug.

QA-09 (minor): signing in from a deep link drops the destination — the user lands on the default screen instead of the CV they asked for. Carry the requested path through sign-in and return to it. Also: /auth is reachable while signed in; send an already-signed-in visitor to the list instead of showing the form again.

Every one of these needs a test that fails without the fix. The list test asserts rendered values from a mocked C-006/C-007 response, not just "something rendered".

Files: web/src/app/*, web/src/features/auth/*, web/src/features/cv/route* and a new web/src/features/cv/list* if you want one.
Do NOT touch web/src/features/cv/editor*, questions*, fields*, entries* or cv.css — lane C owns them.

Read first: ${SPRINT}qa-report.md (QA-02, QA-03, QA-09), framework/docs/api-contracts.md C-007 and C-006.` },

'QA-04': { lane: 'C', title: 'A 503 must not lock the editor, and text must not be clipped', brief:
`QA-04 (blocker): answering a question when the recompose fails returns 503 — and the server has still bumped the CV's version (ADR-015: the answer IS stored and the question IS answered, so the document changed). editor.tsx's catch path never takes that new version, so the client keeps the old one. The next edit PATCHes with a stale version, gets 409, and the editor shows "changed on another device" — which is false — and blocks all saving. The only recovery offered discards the user's edits. QA reproduced it live.

Fix it so the client's version follows the server's whenever the server tells it one, including on the 503 path. The 503 response is the full C-006 shape (C-009) — the answer's own section did not change, but the version did. Then: a test that answers, fails the recompose, edits again and asserts the PATCH succeeds and no conflict banner appears. That test is the task; the rest is detail.

QA-06 (major): <textarea rows={2}> with no auto-grow slices the third line through the glyphs. At 375px all six bullets and the summary are clipped. Make the field grow with its content (or scroll honestly), and assert it at the 300-character bullet the seed provides.

QA-07 (visual): "Log out" overlaps the brand on every signed-in screen, both viewports.
QA-08 (visual): unstyled native controls — a browser-blue link, a bare Regenerate button, a raw file input showing the OS locale. Bring them to design.json's tokens.
QA-11 (visual): the trash icon appears only in Skills while every other delete is the word "Delete". design.json's icons.rule caps the set at one icon; pick one of the two treatments and apply it everywhere.

Files: web/src/features/cv/{editor,entries,fields,questions,draft,types,trash,testkit,save}*, web/src/features/cv/cv.css, web/src/styles/*.
Do NOT touch web/src/features/cv/route* or web/src/app/* — lane B owns them.

Read first: ${SPRINT}qa-report.md (QA-04, QA-06, QA-07, QA-08, QA-11) and its screenshots, framework/docs/design/design.json, framework/docs/api-contracts.md C-009.` },

'QA-05': { lane: 'D', title: 'Question paths name a field, not a section', brief:
`MAJOR, and it breaks the product's one visual idea for two questions in three.

The verifier emits question paths \`summary\` and \`skills[i]\`. The editor aligns a question to the field named by its path and knows \`summary.text\` and \`skills[i].name\`. So those questions cannot find their field: on desktop both cards pile up beside Contact with no amber rule anywhere, and on mobile they are dumped six thousand pixels down the page.

The grammar was never written down, which is why two lanes each picked a reasonable one. Decide it in the contract and make the API obey it: a question's \`path\` names the FIELD the question is about, because that is what the question is for — "which period?" is about the period, not about the entry. So: \`summary.text\`, \`skills[3].name\`, \`experience[1].period\`, \`experience[0].bullets[2].text\`, \`education[0].period\`.

Acceptance:
- framework/docs/api-contracts.md C-006 states the path grammar explicitly, with those examples. This is a clarification of a frozen contract, the same shape as ADR-015 — write it, do not ask.
- api/src/core/generation/verify* and questions* emit field-level paths everywhere they emit a question today. The golden fixtures move with them.
- A test asserts the emitted path for each kind of question, by exact string.
- Nothing else about the verifier changes. The co-occurrence rule, the inheritance and the determinism are all approved and stay exactly as they are.

Files: api/src/core/generation/verify*, api/src/core/generation/questions*, tests/fixtures/golden/*, framework/docs/api-contracts.md.
The web side already expects field-level paths, so do not touch web/.

Read first: ${SPRINT}qa-report.md QA-05, framework/docs/decisions.md ADR-013, framework/docs/api-contracts.md C-006.` },

'QA-10': { lane: 'E', title: 'A failed job must not leave the CV generating forever', brief:
`QA found untitled CVs stuck in state \`generating\` after their job failed — in this case because there is no API key, which is the most ordinary failure there is. The job row goes to \`failed\` with its code, and the CV it belongs to is never told, so the UI shows a spinner for a CV that will never finish.

Acceptance:
- When a run reaches a terminal failure — classified error, budget timeout, attempts exhausted — the CV's state goes to \`failed\` in the SAME fenced write that writes the job row, so a worker that lost its lease cannot change a CV a successor now owns. The success path already does this through persist.ts; mirror it.
- The failure path keeps whatever the CV already had. A failed regeneration must not wipe the draft the user was looking at: assert that explicitly, because this is where that mistake gets made.
- A test per terminal path (classified failure, timeout, exhausted attempts) asserting the CV's state and that its content survived.
- Check the read model: C-006 states are generating | ready | failed, and the UI must be able to tell the user the job failed and offer a retry path. If the state is there but nothing surfaces the error code, say so in the report rather than reaching into web/.

Files: api/src/core/jobs/*, api/src/core/cv/persist*, tests/contract/generation-persist*, scripts/* (the QA seed lives there).

Read first: ${SPRINT}qa-report.md QA-10, api/src/core/jobs/worker.ts, api/src/core/cv/persist.ts, framework/docs/api-contracts.md C-005 and C-006.` },
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

function reviewPrompt(id, devReport) {
  return 'You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + head(id) +
    'The developer reported:\n' + devReport +
    '\n\nYour step: review against the QA findings this task answers. Run the lane-scoped gate and check-lane yourself. For EACH finding, say how you confirmed it is actually fixed — a claim that a screen now works is worth nothing without the assertion or the command that proves it. Apply the stub-test lens. If you reject, put every blocking item in `fixes`.'
}

async function runTask(id) {
  const t = TASKS[id]
  const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + head(id) +
    'Your step: write the failing tests for this task\'s acceptance criteria, and nothing else. No production code. A QA finding becomes a test that reproduces it — if you cannot write one that fails today, say so and why, because that is itself the finding.',
    { label: 'tests:' + id, phase: 'Tests', model: 'haiku', schema: RESULT })

  let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
    'The test-engineer reported:\n' + (red ? red.report : '(no report)') +
    '\n\nYour step: make them green, then run the lane-scoped gate.',
    { label: 'dev:' + id, phase: 'Code', model: 'haiku', schema: RESULT })

  if (dev && !dev.ok && dev.blockedOn === 'code') {
    dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
      'A cheaper model failed this. Its report:\n' + dev.report +
      '\n\nDiagnose the cause, fix it properly, get the lane-scoped gate green.',
      { label: 'dev-retry:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
  } else if (dev && !dev.ok) {
    log(id + ': blocked on ' + dev.blockedOn + ' — back to the Orchestrator')
    return { id, lane: t.lane, dev: false, review: false, blockedOn: dev.blockedOn, notes: dev.report }
  }

  let review = await agent(reviewPrompt(id, dev ? dev.report : '(no report)'), { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })

  if (review && !review.ok && (review.blockedOn === 'code' || review.blockedOn === 'none')) {
    const list = (review.fixes && review.fixes.length ? review.fixes.join('\n- ') : review.report)
    const fixed = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head(id) +
      'The reviewer rejected this with a blocking fix-list:\n- ' + list +
      '\n\nClear every item, then re-run the lane-scoped gate. If an item is wrong, say which and why.',
      { label: 'fix:' + id, phase: 'Fix', model: 'sonnet', schema: RESULT })
    review = await agent(reviewPrompt(id, dev ? dev.report : '(no report)') +
      '\n\nThis is a re-review. The fix pass reported:\n' + (fixed ? fixed.report : '(no report)') +
      '\nCheck only the fix-list items and whether anything regressed.',
      { label: 're-review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })
  }

  return { id, lane: t.lane, dev: !!(dev && dev.ok), review: !!(review && review.ok), blockedOn: review ? review.blockedOn : 'none', notes: review ? review.report : 'no report' }
}

log('QA fixes: four blockers and six lesser findings, five disjoint lanes')

const done = await parallel(['QA-01', 'QA-02', 'QA-04', 'QA-05', 'QA-10'].map(id => () => runTask(id)))
const tasks = done.filter(Boolean)
return {
  tasks,
  green: tasks.filter(t => t.dev && t.review).map(t => t.id),
  needsAttention: tasks.filter(t => !t.dev || !t.review),
}
