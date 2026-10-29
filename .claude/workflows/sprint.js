// sprint.js — deterministic sprint runner (template)
//
// What this file is: a Workflow script that executes stage 3 of
// framework/process/sprint-playbook.md mechanically: for each lane, for each task —
// test-engineer (RED) → developer (GREEN) → reviewer → fix cycle, with the
// escalation ladder from framework/process/model-routing.md. Deterministic
// orchestration is cheaper and more reliable than an LLM re-deciding the loop
// each time; the Orchestrator still does planning and integration around it.
//
// Three things this runner does that a first draft of it did not, each paid
// for once in a real project:
//   - a reviewer rejection opens a FIX CYCLE instead of being filed and
//     forgotten (a task once shipped with a defect the reviewer had written
//     down, because nothing acted on the verdict);
//   - a block is routed by KIND: only `blockedOn: code` earns a stronger
//     model; brief | decision | dependency go straight back to the
//     Orchestrator, because no model tier can supply a missing decision.
//     ok=false with `blockedOn: none` (a failure that names no cause) is
//     READ AS code: a failure nobody attributed to the brief or a decision
//     is a capability failure until something says otherwise — the reading
//     that loses the least, because the ladder is one tier, while an
//     unrouted failure is silently dropped;
//   - the runner's ladder is ONE rung — one tier up with the failure history.
//     It cannot re-brief (a script does not rewrite a brief), so the
//     "re-brief once" rung belongs to whoever hand-drives a task
//     (orchestration.md); a second failure here goes back with both reports;
//   - the lanes run inside a WAVE: wave.sh start before the first lane,
//     wave.sh end (the full union gate) after the last, and every prompt
//     carries its lane's GATE_LANE_TEST — otherwise the gate's wave branch
//     never fires and "green" means lint ran and nothing else.
//
// Fill in: BASE, LANES and TASKS from the sprint's plan.md. The tables are
// validated BEFORE `wave.sh start`: a typo there must fail the run while
// nothing is on disk yet, not inside a chain with the marker up. Run via
// scriptPath (a workflow run persists this script; after editing, re-run by
// scriptPath, not name).

export const meta = {
  name: 'sprint',
  description: 'Run sprint lanes inside a wave: per task — tests first, code, review, fix cycle; blocks routed by kind',
  phases: [
    { title: 'Wave', detail: 'wave.sh start before the lanes, wave.sh end (full gate) after them' },
    { title: 'Tests', detail: 'test-engineer writes failing tests from the acceptance criteria' },
    { title: 'Code', detail: 'developer makes them green against the lane-scoped gate' },
    { title: 'Review', detail: 'code-reviewer runs the gate and check-lane; rejects with a structured fix-list' },
    { title: 'Fix', detail: 'developer clears every fix-list item; reviewer re-checks only those items' },
  ],
}

// Paste from plan.md.
const BASE = ''        // commit the lanes diff against for check-lane.sh (the sprint's bootstrap commit)
const SPRINT = ''      // e.g. 'framework/sprints/SPRINT-NNN-<slug>/'

// One entry per lane. `test` is THE lane test command — it becomes GATE_LANE_TEST
// in every prompt of that lane, which is what makes the wave branch of
// gate.config.sh run anything at all. `allow` is the check-lane.sh allowlist:
// an ARRAY of globs, one per entry, never one comma-joined string — the script
// takes each argument as a glob, so a joined string is one glob that matches
// nothing and every file in the lane comes back as a violation.
const LANES = {
  // '01': { test: '<lane-scoped test command>', allow: ['src/<area>/*', 'tests/<area>/*'] },
}

// Task id → lane and the full brief from the playbook's brief template.
// Tasks inside a chain run in order; chains run in parallel.
const TASKS = {
  // 'T-01': { lane: '01', title: '...', brief: `...` },
}
const CHAINS = [
  // ['T-01', 'T-02'],   // lane 01, in dependency order
]

const PREAMBLE = [
  'Sprint folder: ' + SPRINT,
  'Base ref for check-lane.sh: ' + BASE + '. Commits before it are not lane work.',
  'ALWAYS ALLOWED, besides the files your task names: your own lane log, plan.md (your status row), and any doc the docs-sync rule requires for a change you actually made.',
  'GREEN MEANS YOUR LANE, NOT THE REPO. Other lanes are editing this tree now and tests come first, so the union is red by design while the wave is in flight. Run the gate ONLY as: GATE_LANE_TEST=\'<lane test command below>\' bash framework/scripts/gate.sh. Never judge your task by the bare union and never touch another lane\'s files to fix its red; the Integrator runs the union at wave end.',
  'If you cannot proceed, set blockedOn — code (you tried and your own code is what fails) | brief (the brief contradicts itself or omits what it needs) | decision (an ADR-sized choice nobody made) | dependency (a package or a sibling deliverable the approved list does not give you) — say exactly what you need, and stop. A block is a successful step. It is valid only for what your allowlist or the brief cannot settle: a defect in a file you own, including your own tests, is your task, not a block. You do not write yourself an ADR.',
  'Grep framework/knowledge/errors.md for your task keywords before coding. Never commit; the Orchestrator commits. Report at most 30 lines.',
].join('\n')

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if the step fully met its criteria' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'], description: 'none when ok; otherwise what stopped you. brief | decision | dependency go to the Orchestrator; code, or none with ok=false, is read as a capability failure and climbs the ladder' },
    report: { type: 'string', description: 'max 30 lines: what was done, gate result, what the next step must know' },
    fixes: { type: 'array', items: { type: 'string' }, description: 'reviewer only: every blocking item, one per entry — prose swallows a fix-list; ok=false with an empty list is an invalid verdict' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

function lf(n) { return SPRINT + 'lanes/lane-' + n + '.md' }

// Single-quote one shell word; the only character a single-quoted word cannot
// hold is the quote itself.
function sq(w) { return "'" + String(w).replace(/'/g, "'\\''") + "'" }

// The exact command an agent runs — printed, not described, because the
// one time it was described ("the globs, quoted") the globs went in as one
// argument and the lane's own files were the violations.
function laneCmd(lane) {
  return 'bash framework/scripts/check-lane.sh ' + sq(BASE) + ' ' + lane.allow.map(sq).join(' ')
}

// Tables are checked here, before anything touches the tree. A throw inside
// a running chain would leave the wave marker on disk with `end` never run.
function validateTables() {
  const bad = []
  if (!BASE) bad.push('BASE is empty')
  if (!SPRINT) bad.push('SPRINT is empty')
  for (const [n, lane] of Object.entries(LANES)) {
    if (!lane || typeof lane.test !== 'string' || !lane.test.trim()) bad.push('lane ' + n + ' has no test command — without GATE_LANE_TEST the wave gate runs nothing and passes')
    if (!Array.isArray(lane && lane.allow) || !lane.allow.length || lane.allow.some(g => typeof g !== 'string' || !g.trim())) bad.push('lane ' + n + ': allow must be a non-empty array of globs (not a comma-joined string)')
    else if (lane.allow.some(g => g.includes(','))) bad.push('lane ' + n + ': a glob contains a comma — split it into array entries')
  }
  if (!CHAINS.length) bad.push('CHAINS is empty')
  const seen = new Set()
  for (const chain of CHAINS) {
    if (!Array.isArray(chain) || !chain.length) { bad.push('a chain is empty'); continue }
    for (const id of chain) {
      const t = TASKS[id]
      if (!t) { bad.push(id + ': in CHAINS but not in TASKS'); continue }
      if (seen.has(id)) bad.push(id + ': appears in two chains')
      seen.add(id)
      if (!LANES[t.lane]) bad.push(id + ': lane ' + t.lane + ' is not in LANES')
      if (!t.title || !t.brief) bad.push(id + ': title or brief is empty')
    }
  }
  for (const id of Object.keys(TASKS)) if (!seen.has(id)) bad.push(id + ': in TASKS but in no chain — it would never run')
  if (bad.length) throw new Error('sprint.js tables are not runnable (nothing started):\n  - ' + bad.join('\n  - '))
}

function head(id) {
  const t = TASKS[id]
  const lane = LANES[t.lane]
  return PREAMBLE +
    '\nLane file: ' + lf(t.lane) +
    '\nLane test command (your GATE_LANE_TEST): ' + lane.test +
    '\nLane allowlist (check-lane.sh), one glob per argument: ' + lane.allow.map(sq).join(' ') +
    '\nLane isolation check — run exactly: ' + laneCmd(lane) +
    '\n\n=== Task ' + id + ' — ' + t.title + ' ===\n\n' + t.brief + '\n\n'
}

// A result the ladder may NOT act on: the agent named a cause outside its own
// work. Everything else that is not ok — code, none, a missing result, or a
// value outside the enum — is a capability failure and stays in the loop.
function needsOrchestrator(r) {
  return !!(r && !r.ok && ['brief', 'decision', 'dependency'].includes(r.blockedOn))
}

function blocked(id, lane, r, step) {
  const kind = r.blockedOn
  log(id + ': ' + step + ' blocked on ' + kind + ' — not escalating; this one is the Orchestrator\'s')
  return { id, lane, dev: false, review: false, blockedOn: kind, notes: r.report }
}

async function runTask(id) {
  const t = TASKS[id]
  const h = head(id)

  const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + h +
    'Your step: write the failing tests for the acceptance criteria above and nothing else. No production code. Apply the stub-test rule: if a hard-coded happy value would pass your suite, the suite is decoration. Run the lane test command and report exactly what is red and why — a failure on a missing module is a different signal from a failure on an assertion.',
    { label: 'tests:' + id, phase: 'Tests', model: 'haiku', schema: RESULT })
  if (needsOrchestrator(red)) return blocked(id, t.lane, red, 'test-engineer')

  let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + h +
    'Tests exist and are RED. The test-engineer reported:\n' + (red ? red.report : '(no report)') +
    '\n\nYour step: make them green, then run the lane-scoped gate. Fixing a type error in a test file is your job and is not weakening a test; loosening or deleting an assertion to go green is. If a criterion needs a decision that is not yours, implement the rest and block on it plainly — do not improvise a dependency or a rule.',
    { label: 'dev:' + id, phase: 'Code', model: 'haiku', schema: RESULT })

  // Escalation ladder: only a capability failure earns a stronger model. A
  // decision, a dependency or a defective brief cannot be fixed by paying a
  // second model to read the same brief — it goes back to the Orchestrator.
  // A failure with `blockedOn: none` is a capability failure that named no
  // cause (see the header): it climbs, it is not dropped.
  if (needsOrchestrator(dev)) return blocked(id, t.lane, dev, 'developer')
  if (!dev || !dev.ok) {
    const firstReport = dev ? dev.report : '(no report at all)'
    log(id + ': failed on its own work (blockedOn ' + (dev ? dev.blockedOn : 'no result') + ') — escalating (model-routing ladder, next tier)')
    dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + h +
      'A cheaper model attempted this and failed on its own code. Its report:\n' + (dev ? dev.report : '(no report at all)') +
      '\n\nYour step: diagnose what it actually got wrong, fix the cause rather than the symptom, and get the lane-scoped gate green. If the brief itself turns out to be defective, block on it — do not improvise around it.',
      { label: 'dev-retry:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
    if (needsOrchestrator(dev)) return blocked(id, t.lane, dev, 'developer (retry)')
    // Two attempts is the ladder's whole length (model-routing.md). A task the
    // stronger model could not finish does not go on to a reviewer and a third
    // paid pass over code that is still red: it comes back to the Orchestrator
    // with BOTH reports, because the pair is the evidence — a stronger model
    // failing the same way is the signature of a wrong criterion, not a hard task.
    if (!dev || !dev.ok) {
      log(id + ': failed at both tiers — returning to the Orchestrator with both reports')
      return {
        id, lane: t.lane, dev: false, review: false, blockedOn: 'code',
        notes: 'first attempt:\n' + firstReport + '\n\nretry (next tier):\n' + (dev ? dev.report : '(no report at all)'),
      }
    }
  }

  const reviewPrompt = 'You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + h +
    'The developer reported:\n' + (dev ? dev.report : '(no report)') +
    '\n\nYour step: review the diff against the acceptance criteria. Run the lane-scoped gate yourself (do not take the developer\'s word for it) and the lane isolation check exactly as printed above — one glob per quoted argument, never one joined string; append the always-allowed files as further quoted arguments. Fail the task if tracked or untracked files outside them changed. Perform the mutation check from .claude/rules/testing.md and record it. Do not fail the task for another lane\'s red. If you reject: ok=false and EVERY blocking item in `fixes`, one per entry — a fix-list that is only prose gets lost, and the fix pass and re-review are measured against the list. Append your verdict to the lane file.'

  let review = await agent(reviewPrompt, { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })
  if (needsOrchestrator(review)) return blocked(id, t.lane, review, 'reviewer')

  // Fix cycle: a rejection is acted on, not recorded. One cycle; a task still
  // rejected after it comes back in needsAttention with the remaining list.
  if (review && !review.ok) {
    const list = review.fixes && review.fixes.length ? review.fixes : [review.report]
    log(id + ': reviewer rejected with ' + list.length + ' item(s) — fix cycle')
    const fixed = await agent('You are the developer (.claude/agents/developer.md).\n\n' + h +
      'The reviewer rejected this task. Blocking fix-list:\n- ' + list.join('\n- ') +
      '\n\nYour step: clear EVERY item, then re-run the lane-scoped gate. If an item is wrong, say which and why in your report instead of silently skipping it. Do not argue with the reviewer in code comments.',
      { label: 'fix:' + id, phase: 'Fix', model: 'sonnet', schema: RESULT })
    if (needsOrchestrator(fixed)) return blocked(id, t.lane, fixed, 'fix pass')
    review = await agent(reviewPrompt +
      '\n\nThis is a RE-REVIEW after a fix pass. The previous fix-list:\n- ' + list.join('\n- ') +
      '\nThe fix pass reported:\n' + (fixed ? fixed.report : '(no report)') +
      '\n\nCheck ONLY the fix-list items, one by one, and whether anything regressed (gate and check-lane again). Do not open new ground the first review passed. If items remain, return them in `fixes`.',
      { label: 're-review:' + id, phase: 'Fix', model: 'haiku', schema: RESULT })
  }

  return {
    id, lane: t.lane,
    dev: !!(dev && dev.ok),
    review: !!(review && review.ok),
    blockedOn: review ? review.blockedOn : 'none',
    fixesLeft: review && !review.ok ? (review.fixes || []) : [],
    notes: review ? review.report : 'no reviewer report',
  }
}

// --- Wave bracket. The script itself has no shell, so two mechanical agent
// steps own the marker. Lanes here share one tree (no worktrees), so there is
// no merge between the last lane and `end`; with worktree lanes the Integrator
// merges first and runs `end` itself. Without `start` the gate silently runs
// the union against half-finished lanes; without `end` it runs the weak lane
// gate forever. `end` therefore runs even when a chain throws: the throw is
// re-raised AFTER the marker is gone.
const WAVE = { type: 'object', properties: { ok: { type: 'boolean' }, report: { type: 'string' } }, required: ['ok', 'report'] }

validateTables()

const started = await agent('Run exactly: bash framework/scripts/wave.sh start — then bash framework/scripts/wave.sh status. Do nothing else. ok=true only if status reports a wave in flight; report both outputs verbatim.',
  { label: 'wave:start', phase: 'Wave', model: 'haiku', schema: WAVE })
if (!started || !started.ok) {
  return { lanes: [], needsAttention: [], wave: { started: false, report: started ? started.report : 'no report' } }
}

// Chains run in parallel (they are disjoint by plan); tasks inside a chain run
// in order and a chain stops at its first task that is not green — its
// successors would build on a block.
let chains = []
let failure = null
try {
  chains = await parallel(CHAINS.map(chain => async () => {
    const out = []
    for (const id of chain) {
      const r = await runTask(id)
      out.push(r)
      if (!r.dev) { log(chain.join(' → ') + ': stopping the chain at ' + id + (r.blockedOn && r.blockedOn !== 'none' ? ' (blockedOn ' + r.blockedOn + ')' : '')); break }
    }
    return out
  }))
} catch (e) {
  failure = e
  log('a chain threw (' + (e && e.message ? e.message : String(e)) + ') — closing the wave before failing the run')
}

const ended = await agent('Every lane of this wave has finished. Run exactly: bash framework/scripts/wave.sh end — it removes the wave marker and runs the FULL gate (the union). Do not fix anything. ok=true only if the full gate is green; report its output verbatim, failures first.',
  { label: 'wave:end', phase: 'Wave', model: 'haiku', schema: WAVE })

if (failure) {
  log('wave:end after the throw: ' + (ended ? (ended.ok ? 'full gate green' : 'full gate NOT green') + ' — ' + ended.report : 'no report'))
  throw failure
}

const tasks = chains.filter(Boolean).flat()
return {
  tasks,
  green: tasks.filter(t => t.dev && t.review).map(t => t.id),
  // Blocks by kind are the Orchestrator's inbox: brief → Teamlead, decision |
  // dependency → Architect (usually an ADR), code → the ladder ran out.
  blocked: tasks.filter(t => t.blockedOn && t.blockedOn !== 'none').map(t => ({ id: t.id, blockedOn: t.blockedOn, notes: t.notes })),
  // Rejected after the fix cycle, or failed the ladder (code / none).
  needsAttention: tasks.filter(t => !t.dev || !t.review),
  wave: { started: true, fullGateGreen: !!(ended && ended.ok), report: ended ? ended.report : 'no report' },
}
