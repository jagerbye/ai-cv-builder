// finish-t12.js — the last open task of wave A, plus one carried fix.
//
// T-12's developer stopped on a decision rather than inventing a rule, which
// is what blockedOn was added for. The decision is made (ADR-013, amended:
// co-occurrence), so this is now an ordinary coding task.

export const meta = {
  name: 'finish-t12',
  description: 'Verifier: enforce co-occurrence per ADR-013 amended; align the toolchain pin test with ADR-012',
  phases: [{ title: 'Code' }, { title: 'Review' }],
}

const BASE = 'c287bd7'

const PREAMBLE = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder. Sprint: framework/sprints/SPRINT-001-skeleton-auth/.',
  'Base ref for check-lane.sh: ' + BASE + '. Always allowed besides your named files: your lane log, plan.md, and any doc docs-sync requires for a change you made.',
  'Run the gate as GATE_LANE_TEST=\'<your lane test command>\' bash framework/scripts/gate.sh. Other lanes share this tree; never report red for their files.',
  'If you are blocked on a decision, a dependency, or a rule the types cannot express: STOP, set blockedOn, and say exactly what you need. Do not write yourself an ADR. Reporting a block is a successful step.',
  'Never commit; the Orchestrator commits.',
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

const TASKS = {
  'T-12': { lane: '07', brief:
`Task T-12, final pass: enforce co-occurrence in the verifier.

Your previous pass was right to stop. The rule it asked for has been decided — framework/docs/decisions.md, ADR-013, the "Amended 2026-10-28" block. Read it; it is the specification for this pass. In short, per-field checks over a SET of cited facts cannot forbid recombining that set, so:

- An experience entry needs at least ONE cited fact containing BOTH its employer and its period. No such fact: drop the entry, priority-1 question.
- The role must occur in a cited fact that ALSO names the employer. If it occurs only in a fact that does not, KEEP the entry and raise a vague question — a source often names employer and title in separate sentences, and dropping a real job over that costs more than asking.
- An education entry needs one cited fact containing both its institution and its period, same failure direction.
- Bullets keep the ADR-002 rule: own cited facts plus the parent entry's, one level.

Acceptance:
- The currently red test — "rejects an entry assembled from two unrelated facts: {Acme Ltd, Backend engineer, 2019} citing f1 and f2" — goes green WITHOUT editing the test.
- The 30 golden fixtures stay green, and the prompt-injection fixture's output structure is still unchanged by the injected instruction.
- verify() stays deterministic: no clock, no randomness, no LLM call, same input same output.
- Anything the earlier passes already satisfied still holds.

Files you may touch: api/src/core/generation/verify*, api/src/core/generation/questions*, tests/fixtures/golden/** and their tests. Do NOT touch types.ts (refrozen) or decisions.md.

Read first: framework/docs/decisions.md ADR-013 (the amendment) and ADR-002, framework/docs/spec.md §3.4.

Lane test command: npm -w api run test -- --run src/core/generation/verify src/core/generation/questions` },

  'T-24': { lane: '01', brief:
`Task T-24: align the toolchain pin test with ADR-012.

api/src/toolchain.test.ts asserts @types/node is 22.x. ADR-012 moved the project to Node 24 LTS and T-03 repinned @types/node to 24.x everywhere, so that assertion now fails the union gate — and it is the Integrator's blocker, not any lane's.

This is a CORRECTED test, not a weakened one: the pin it guards changed by an accepted decision, and the test must guard the new pin just as strictly. Keep it asserting an exact version from the real manifests, so a hard-coded value would still fail it.

Acceptance:
- api/src/toolchain.test.ts asserts the 24.x pin, reading the real manifests and lockfile as it does today.
- npm -w api run test -- --run src/toolchain is green.
- Add a one-line entry to framework/knowledge/errors.md: a version pin asserted in a test is a second place the version lives, and an ADR that changes the pin must change the test in the same breath.

Files you may touch: api/src/toolchain.test.ts, framework/knowledge/errors.md.

Read first: framework/docs/decisions.md ADR-012 and ADR-010.

Lane test command: npm -w api run test -- --run src/toolchain` },
}

async function runTask(id) {
  const t = TASKS[id]
  const head = PREAMBLE + '\nLane file: framework/sprints/SPRINT-001-skeleton-auth/lanes/lane-' + t.lane + '.md\n\n' + t.brief + '\n\n'

  let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head +
    'Your step: implement it and get the lane-scoped gate green.',
    { label: 'dev:' + id, phase: 'Code', model: 'haiku', schema: RESULT })

  if (dev && !dev.ok && dev.blockedOn === 'code') {
    dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + head +
      'A cheaper model failed this. Its report:\n' + dev.report + '\n\nFix the cause, not the symptom.',
      { label: 'dev-retry:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
  } else if (dev && !dev.ok) {
    log(id + ': blocked on ' + dev.blockedOn + ' — returning to the Orchestrator')
    return { id, dev: false, review: false, blockedOn: dev.blockedOn, notes: dev.report }
  }

  const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + head +
    'The developer reported:\n' + (dev ? dev.report : '(none)') +
    '\n\nReview against the acceptance criteria. Run the lane-scoped gate and check-lane.sh ' + BASE + ' yourself. Stub-test lens applies. Do not fail the task for another lane\'s red or for the always-allowed files.',
    { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })

  return { id, dev: !!(dev && dev.ok), review: !!(review && review.ok), blockedOn: review && review.blockedOn, notes: review ? review.report : 'no report' }
}

const out = await parallel([() => runTask('T-12'), () => runTask('T-24')])
const tasks = out.filter(Boolean)
return { tasks, needsAttention: tasks.filter(t => !t.dev || !t.review) }
