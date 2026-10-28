// sprint.js — deterministic sprint runner (template)
//
// What this file is: a Workflow script that executes stage 3 of
// framework/process/sprint-playbook.md mechanically: for each lane, for each task —
// test-engineer (RED) → developer (GREEN) → reviewer, with the Sonnet retry
// from the escalation ladder. Deterministic orchestration is cheaper and
// more reliable than an LLM re-deciding the loop each time; the Orchestrator
// still does planning and integration around it.
//
// Fill in: LANES from the sprint's plan.md. Run via scriptPath (a workflow
// run persists this script; after editing, re-run by scriptPath, not name).

export const meta = {
  name: 'sprint',
  description: 'Run sprint lanes: per task — tests first, code, review, with Sonnet retry on failure',
  phases: [{ title: 'Tests' }, { title: 'Code' }, { title: 'Review' }],
}

// Paste from plan.md: one entry per lane, tasks in dependency order.
const LANES = [
  // { lane: '01', tasks: [{ id: 'T-01', brief: `...full lane-brief text...` }] },
]

const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, report: { type: 'string' } }, required: ['ok', 'report'] }

async function runTask(lane, t) {
  const red = await agent(
    `You are the test-engineer (.claude/agents/test-engineer.md). ${t.brief}\nWrite failing tests only; confirm RED.`,
    { label: `tests:${t.id}`, phase: 'Tests', model: 'haiku', schema: RESULT })

  let dev = await agent(
    `You are the developer (.claude/agents/developer.md). ${t.brief}\nTests exist and are RED: ${red.report}\nMake them green; run the gates.`,
    { label: `dev:${t.id}`, phase: 'Code', model: 'haiku', schema: RESULT })

  if (!dev.ok) { // escalation ladder step 2: Sonnet with failure history
    dev = await agent(
      `You are the developer (.claude/agents/developer.md). ${t.brief}\nA previous attempt failed: ${dev.report}\nFix it properly; run the gates.`,
      { label: `dev-retry:${t.id}`, phase: 'Code', model: 'sonnet', schema: RESULT })
  }

  const review = await agent(
    `You are the code-reviewer (.claude/agents/code-reviewer.md). Review task ${t.id} in lane ${lane}. Brief was: ${t.brief}\nRun the gates yourself; append verdict to the lane file.`,
    { label: `review:${t.id}`, phase: 'Review', model: 'haiku', schema: RESULT })

  return { id: t.id, dev: dev.ok, review: review.ok, notes: review.report }
}

// Lanes run in parallel (they are disjoint by plan); tasks inside a lane run
// in order (they may depend on each other).
const results = await parallel(LANES.map(l => async () => {
  const out = []
  for (const t of l.tasks) out.push(await runTask(l.lane, t))
  return { lane: l.lane, tasks: out }
}))

// Escalations beyond Sonnet and failed reviews come back to the Orchestrator.
return { lanes: results, needsAttention: results.flatMap(l => l.tasks.filter(t => !t.dev || !t.review)) }
