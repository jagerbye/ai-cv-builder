// finish-wave-a.js — closes the six tasks wave A left open.
//
// Three of them (T-17, T-18, T-19) were approved on code and tests and failed
// only on check-lane, against a base ref that predated the Orchestrator's own
// commits. Those get a re-review, not another development cycle.
//
// Two (T-03, T-04) were blocked by ADR-012 (Node 24) and one chain
// (T-11 → T-12) by ADR-013, which unfroze a contract. Those get a full cycle,
// in order, because T-12 reads what T-11 emits.

export const meta = {
  name: 'finish-wave-a',
  description: 'Close wave A: re-review three allowlist-only tasks, rebuild auth on Node 24, re-cut compose and verify for ADR-013',
  phases: [
    { title: 'Re-review', detail: 'three tasks whose only blocker was the lane check' },
    { title: 'Tests' }, { title: 'Code' }, { title: 'Review' }, { title: 'Fix' },
  ],
}

const BASE = '49f5af7'

const PREAMBLE = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder. Sprint: framework/sprints/SPRINT-001-skeleton-auth/.',
  'Base ref for check-lane.sh: ' + BASE + '. Orchestrator commits before it are NOT lane work and are not violations.',
  'ALWAYS ALLOWED, in addition to the files your task names: your own lane log, plan.md, and any doc the docs-sync rule requires for a change you actually made. Judging a lane for touching those is a false failure — three tasks lost a round to it already.',
  'GREEN MEANS YOUR LANE. Other lanes share this tree. Run the gate as: GATE_LANE_TEST=\'<your lane test command>\' bash framework/scripts/gate.sh. Never report red for a failure in another lane\'s files; the Integrator runs the union.',
  'If your blocker is a decision, a missing dependency, or a rule the frozen types cannot express, STOP and say so plainly in your report. Do not improvise, and do not write yourself an ADR — ADRs are the architect\'s. Saying "blocked, and here is exactly why" is a successful step, not a failed one.',
  'Jira is virtual (board.md, ADR-009). Never commit; the Orchestrator commits.',
].join('\n')

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 30 lines' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

function lf(n) { return 'framework/sprints/SPRINT-001-skeleton-auth/lanes/lane-' + n + '.md' }

// --- Stage 1: the three that only ever failed the lane check.
const RECHECK = [
  { id: 'T-17', lane: '06', allow: 'api/src/core/cv/**, api/src/routes/cvs.ts, tests/contract/cvs-read*' },
  { id: 'T-18', lane: '06', allow: 'api/src/core/cv/**, api/src/routes/cvs.ts, tests/contract/cvs-patch*' },
  { id: 'T-19', lane: '06', allow: 'api/src/core/export/**, api/src/routes/export.ts, api/assets/fonts/**, tests/contract/export*' },
]

const rechecked = await parallel(RECHECK.map(t => () => agent(
  'You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + PREAMBLE +
  '\nLane file: ' + lf(t.lane) + '\n\n' +
  'Task ' + t.id + ' was already reviewed twice. Both times the verdict was: code and tests approved, blocked on check-lane only — and that check ran against a base ref older than the Orchestrator\'s own commits, so it reported those commits as violations of this lane.\n\n' +
  'Re-run the check honestly against base ' + BASE + ' with the allowlist: ' + t.allow + ' plus the always-allowed files above.\n' +
  'Re-run the lane-scoped gate yourself.\n\n' +
  'Then give a final verdict. Approve if the code meets its acceptance criteria and the only remaining violations are files this lane legitimately had to touch. Do NOT re-litigate items the previous rounds cleared; the lane log has them. If something real is still wrong, say what, with the failing command.',
  { label: 'recheck:' + t.id, phase: 'Re-review', model: 'haiku', schema: RESULT })))

// --- Stage 2: the two chains that needed an architect decision first.
const TASKS = {
  'T-03': { lane: '02', brief:
`Task T-03 (reopened): registration on Node 24.

The code was reviewed and is sound. One blocker: it hashes with node:crypto.argon2, which exists from Node 24.7, while .nvmrc, api/Dockerfile, web/Dockerfile, both engines fields and CI all pin Node 22. Registration therefore passes locally and answers 500 INTERNAL inside the container.

ADR-012 (framework/docs/decisions.md) decided this: the project moves to Node 24 LTS rather than adding a native argon2 dependency. Carry the bump.

Acceptance:
- .nvmrc, api/Dockerfile, web/Dockerfile, both engines fields and .github/workflows/ci.yml all name Node 24; @types/node is pinned exact to a 24.x.
- docker compose build && docker compose up -d --wait succeeds, and registration through the CONTAINER returns 201 and sets the cookie — not only on the host. Prove it in the report with the command you ran.
- Everything F-001 and C-001 already required still holds.

Files you may touch: .nvmrc, api/Dockerfile, web/Dockerfile, package.json, api/package.json, web/package.json, package-lock.json, .github/workflows/ci.yml, api/src/core/auth/**, api/src/routes/auth.ts, api/src/http/errors.ts, tests/contract/auth-register*.

Read first: framework/docs/decisions.md ADR-012, framework/docs/api-contracts.md C-001.

Lane test command: npm -w api run test -- --run src/core/auth tests/contract/auth-register` },

  'T-04': { lane: '02', brief:
`Task T-04 (reopened): login, session cookie and the ownership guard, on Node 24.

The T-04 logic was reviewed and no defect was found in it. It was blocked behind T-03's Node version and an allowlist complaint about api/vitest.config.ts, which an Orchestrator commit had already changed to include tests/contract — that file is allowed to you now.

Acceptance: everything spec.md F-001 and contract C-002 require, as before, plus — verify the session flow through the CONTAINER, not only on the host, now that T-03 has bumped the runtime.

Files you may touch: api/src/core/auth/**, api/src/routes/auth.ts, api/src/http/requireUser.ts, api/src/http/errors.ts, api/vitest.config.ts, tests/contract/auth-session*.

Read first: framework/docs/api-contracts.md C-002, framework/docs/decisions.md ADR-007 and ADR-012.

Lane test command: npm -w api run test -- --run src/core/auth tests/contract/auth-session` },

  'T-11': { lane: '04', brief:
`Task T-11 (reopened by ADR-013): compose must cite the facts behind every experience entry and education entry.

ADR-013 unfroze C-012 for exactly one change, because the verifier could not implement the entity rule without it: CvDraft gave factIds to summary, bullets and skills but not to experience entries or education, so "occurs in one of its cited facts" had no referent for an employer, an institution or a period.

Acceptance:
- api/src/core/generation/types.ts: experience[] and education[] each gain factIds: string[]. Change nothing else in that file — it is refrozen the moment you are done, and T-12 is waiting on exactly this shape.
- The compose stage emits them: an entry's factIds are the facts that establish its employer, role and period; an education entry's, its institution and period.
- A test asserts an entry whose employer appears in no cited fact is not produced, and that compose still never receives the source text.
- Everything T-11 already satisfied still holds; do not touch extract or the gateway.

Files you may touch: api/src/core/generation/types.ts, api/src/core/generation/compose*, api/src/core/generation/prompts/compose*, tests/fixtures/llm/compose*, their tests.

Read first: framework/docs/decisions.md ADR-013 and ADR-002, framework/docs/api-contracts.md C-012.

Lane test command: npm -w api run test -- --run src/core/generation/compose src/core/generation/types` },

  'T-12': { lane: '07', brief:
`Task T-12 (reopened by ADR-013): the verifier checks entry fields against the entry's own facts.

Your previous pass diagnosed the problem correctly and the diagnosis was accepted: the frozen CvDraft had no factIds on entries, so the entity rule had no referent. The resolution written in that pass was NOT accepted. Relaxing the rule to "occurs in some extracted fact" permits mis-pairing — facts "Intern at Acme Ltd, 2015-2017" and "Backend engineer at Globex, 2019" would accept the entry {Acme Ltd, Backend engineer, 2019}, every token real and the combination invented. That is the exact failure this product exists to prevent.

T-11 has now added factIds to experience[] and education[] (ADR-013).

Acceptance:
- Entry and education fields are verified against the ENTRY'S OWN cited facts, with the one level of parent-to-child inheritance ADR-002 allows: a bullet checks against its own facts plus its parent entry's.
- The mis-pairing test is INVERTED: {Acme Ltd, Backend engineer, 2019} assembled from two unrelated facts must now be REJECTED and raise a question. Delete the test that pinned the old permissive behaviour and say so in the report — this is a corrected test, which the rules allow with the reason recorded, not a weakened one.
- The prompt-injection golden fixture cites its entry's facts, and its output structure is still unchanged by the injected instruction.
- The ADR-002 amendment A block is gone from decisions.md; ADR-013 replaced it. You do not edit decisions.md yourself.
- Determinism holds: no clock, no randomness, no LLM call in verify().

Files you may touch: api/src/core/generation/verify*, api/src/core/generation/questions*, tests/fixtures/golden/**, their tests.

Read first: framework/docs/decisions.md ADR-013 and ADR-002, framework/docs/spec.md §3.4 and §3.5.

Do NOT touch types.ts — T-11 owns that change and it is refrozen.

Lane test command: npm -w api run test -- --run src/core/generation/verify src/core/generation/questions` },
}

async function runTask(id) {
  const t = TASKS[id]
  const head = PREAMBLE + '\nLane file: ' + lf(t.lane) + '\n\n' + t.brief + '\n\n'

  const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + head +
    'Your step: write or adjust the failing tests for the acceptance criteria above, and nothing else. No production code. Report which assertions are red and why.',
    { label: 'tests:' + id, phase: 'Tests', model: 'haiku', schema: RESULT })

  let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head +
    'The test-engineer reported:\n' + (red ? red.report : '(no report)') +
    '\n\nYour step: make them green, then run the lane-scoped gate. Fixing a type error in a test file is your job and is not weakening a test.',
    { label: 'dev:' + id, phase: 'Code', model: 'haiku', schema: RESULT })

  // Only a capability failure earns another model. A decision, a dependency or
  // a defective brief comes back to the Orchestrator instead (FF-11).
  if (dev && !dev.ok && dev.blockedOn === 'code') {
    dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head +
      'A cheaper model failed this. Its report:\n' + dev.report +
      '\n\nDiagnose the cause, fix it properly, get the lane-scoped gate green.',
      { label: 'dev-retry:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
  } else if (dev && !dev.ok) {
    log(id + ': blocked on ' + (dev.blockedOn || '?') + ' — not escalating, this is the Orchestrator\'s')
    return { id, lane: t.lane, dev: false, review: false, blockedOn: dev.blockedOn, notes: dev.report }
  }

  const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + head +
    'The developer reported:\n' + (dev ? dev.report : '(no report)') +
    '\n\nYour step: review against the acceptance criteria. Run the lane-scoped gate and check-lane.sh ' + BASE + ' yourself. Apply the stub-test lens. Do not fail the task for another lane\'s red, or for the always-allowed files.',
    { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })

  return { id, lane: t.lane, dev: !!(dev && dev.ok), review: !!(review && review.ok), blockedOn: review && review.blockedOn, notes: review ? review.report : 'no report' }
}

log('closing wave A: auth on Node 24, and compose → verify for ADR-013')
const closed = await parallel([
  async () => { const o = []; for (const id of ['T-03', 'T-04']) o.push(await runTask(id)); return o },
  async () => { const o = []; for (const id of ['T-11', 'T-12']) o.push(await runTask(id)); return o },
])

const tasks = closed.filter(Boolean).flat()
return {
  recheck: RECHECK.map((t, i) => ({ id: t.id, ok: rechecked[i] ? rechecked[i].ok : null, notes: rechecked[i] ? rechecked[i].report : 'no report' })),
  tasks,
  needsAttention: tasks.filter(t => !t.dev || !t.review),
}
