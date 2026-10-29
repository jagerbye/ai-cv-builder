export const meta = {
  name: 'b024-pass2',
  description: 'The harvest sent itself back: the runner that is the evidence for two findings, the stale usages that re-create the one they fixed, and three half-applied items',
  phases: [{ title: 'Fix' }, { title: 'Verify' }],
}

const SRC = '/Users/mike/Desktop/www/ai-cv-builder'
const DST = '/Users/mike/Desktop/www/ai-dev-framework'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    report: { type: 'string', description: 'max 25 lines' },
  },
  required: ['ok', 'report'],
}

const COMMON = `TARGET: ${DST}. It is a git repo; 3efc0ee is the pre-harvest baseline and 8409fcf is the harvest's first pass, so you can diff what already changed.
The findings are at ${SRC}/framework/knowledge/framework-feedback.md, with working implementations in that project's own tree.

THE TEMPLATE IS ABSTRACT: it must not name the project these lessons came from, its domain, or treat its stack as the framework's. A lesson from one queue is a lesson about a shared resource. A reviewer greps for that and will find you.

Never commit — the Orchestrator commits. Report at most 25 lines.`

const LANES = {

'runner': `You own: ${DST}/.claude/workflows/sprint.js — and nothing else.

The harvest's reviewer sent this back first, and it was right to: FF-01 and FF-11 are the two findings whose EVIDENCE IS THIS FILE, and the first pass changed every document that describes the runner's behaviour without changing the runner. The playbooks now promise a fix-list, a \`blockedOn\` field and a fix cycle that the shipped runner neither requests nor acts on. A template that documents behaviour it does not have is worse than one that documents nothing.

FF-01: the runner collects a reviewer's verdict and drops it. In the source project a task shipped with a defect the reviewer had already caught and written down. Give the result schema a \`fixes\` array, tell the reviewer to put every blocking item in it one per entry because prose swallows a fix-list, and add the cycle: on a rejection, a fix pass that must clear every item, then a re-review that checks only those items and whether anything regressed.

FF-11: today line 35 escalates on any failure. That assumes the failure is capability. Add \`blockedOn\` to the schema — \`none | code | brief | decision | dependency\` — and escalate ONLY on \`code\`. Everything else stops the task and returns it to the Orchestrator with its reason, because a stronger model cannot resolve a missing decision, a missing dependency or a defective brief; it can only pay twice to be told the same thing. The evidence from the first real build: after this change, across two waves and three fix rounds, not one task came back \`blockedOn: code\` — the capability rung went unused and four blocks became architecture decisions.

Also, because the first pass added a wave mode that nothing turns on: each task's brief must export its own lane test command as GATE_LANE_TEST, and the wave's start and end must bracket the lanes. Without that the wave branch of the gate config never fires and the lane-test step is empty — a gate that looks green because it ran nothing.

Read ${SRC}/.claude/workflows/sprint.js and the runners beside it: they are this same file after a real project, with the schema, the routing and the fix cycle already proven.`,

'wiring': `You own: ${DST}/CLAUDE.md, ${DST}/.claude/agents/code-reviewer.md, ${DST}/.claude/agents/integrator.md, ${DST}/framework/process/sprint-playbook.md, ${DST}/framework/process/orchestration.md, ${DST}/framework/process/qa-playbook.md.

Three things the harvest's reviewer found, and the first is embarrassing in a useful way.

1. CLAUDE.md line ~69 and the code-reviewer role file still show the old \`check-lane.sh <base> <allowlist>\` usage, while the script now takes trailing globs or \`-f <file>\`. FF-12 existed precisely because agents passed globs to a script that wanted a file; the first pass fixed the script and then re-created the confusion in the two files an agent reads FIRST. Fix both, and make the usage line say which form is which.

2. The first pass added \`wave.sh\` and a wave mode, and nothing in any playbook says to use them. The Integrator's role, the sprint playbook and orchestration never mention starting a wave before the first lane, ending it before integration, or that a lane's brief must export GATE_LANE_TEST. Wire it: who starts it, who ends it, what happens if someone forgets (the gate silently runs the full union against a tree full of half-finished lanes, which is FF-10 all over again).

3. The sprint playbook §4.5 and the QA playbook both say the bootstrap task "ends with the stack started and its front door reached", and §1's bootstrap bullet says only that it ships the shared files empty. Make §1 say the whole thing — that bootstrap is also where the runtime seam gets proved, which is the FF-15 lesson: in the first real build nothing ever opened the product until manual QA, and the defect had survived two waves, sixty-six reviews and two integrations by then.

Keep CLAUDE.md a router under about 100 lines.`,

'half': `You own: ${DST}/framework/process/design-playbook.md, ${DST}/.claude/agents/architect.md, ${DST}/framework/docs/runbooks/*, ${DST}/framework/scripts/gate.config.example.sh, ${DST}/framework/cycle-uml.md.

Three findings the harvest applied only partly, and two bits of drift.

1. FF-03 — the design token file shipped as another product's filled-in tokens, so a design lane obeyed confidently wrong values. The first pass addressed this in the design playbook; make it enforceable rather than advisory: the playbook should require the lane to ASSERT the tokens are unfilled before trusting them, and say what to do when they are not.

2. FF-04 — the architecture template's dependency section never named the toolchain (linter, DOM test environment, bundler, type packages), so agents improvised around a hard "no new dependencies" rule three separate times: substituting a type-checker for a linter, a server environment for a browser one, a type-check for a build. The first pass touched the architect's role file. Add the completeness check the finding asks for: before lanes start, the architect verifies the dependency list covers the toolchain, not only the runtime libraries.

3. FF-09 — "free the port" is the wrong remedy on a shared developer machine, where that port may belong to someone else's project that has held it for weeks. Move your own port instead. The first pass put it in a runbook; make sure it is where a reviewer will actually meet it, since in the source project it was a REVIEWER who gave the bad advice.

4. \`gate.config.example.sh\` carries the source project's stack verbatim — its package runner, its type-checker, its health path, its session cookie name, its root element. As an example that is defensible, but only if a reader cannot mistake it for a default. Make each one visibly a placeholder or mark the block as illustrative line by line. Your call which; say why.

5. \`framework/cycle-uml.md\` still describes the "stub-check" and predates the mutation rule, so the diagram now contradicts \`.claude/rules/testing.md\`. Bring it in step. It is also written in a different language from the rest of the template — leave the language as it is, that is the owner's choice, but the content must not contradict the rules.`,
}

const fixed = await parallel(Object.entries(LANES).map(([name, brief]) => () => agent(
  'You are the Architect (.claude/agents/architect.md) working on the framework template itself.\n\n' + COMMON + '\n\n=== YOUR AREA: ' + name + ' ===\n\n' + brief,
  { label: 'fix:' + name, phase: 'Fix', model: 'fable', schema: RESULT })))

const verify = await agent(
  'You are the code-reviewer (.claude/agents/code-reviewer.md). Project: the framework template at ' + DST + ', now at its second harvest pass.\n\n' +
  'The three lanes reported:\n\n' + fixed.map((f, i) => '— ' + Object.keys(LANES)[i] + ': ' + (f ? f.report : '(no report)')).join('\n\n') +
  '\n\nVerify, taking nothing on trust:\n' +
  '1. THE RUNNER. Read .claude/workflows/sprint.js yourself. Does its result schema carry blockedOn and fixes? Does it escalate ONLY on blockedOn=code — trace the branch and say what happens for each of the other values. Is there a fix pass and a re-review, and does the re-review receive the fix-list? Does each task export GATE_LANE_TEST, and does something start and end the wave? A promise in a playbook that the runner does not keep is the defect this pass exists to close, so be literal.\n' +
  '2. NO CONTRADICTIONS LEFT. grep the whole tree for the old check-lane usage and for any other command signature that disagrees with the script it describes. Confirm the bootstrap task is described the same way in every file that mentions it. Confirm the testing rule and the reviewer role still agree on the mutation check.\n' +
  '3. IT RUNS. In a scratch copy, exercise gate.sh with no project config, with a wave marker, and after the wave ends; check-lane.sh in both forms and with a missing file; and the commit guard. Report the exact outcomes.\n' +
  '4. ABSTRACTNESS, again: grep case-insensitively for the source project\'s name, domain nouns and issue key, and for its stack appearing as if it were the framework\'s choice rather than a marked example.\n\n' +
  'Then give the verdict: is B-024 done, or what is still open. Report at most 30 lines.',
  { label: 'verify2', phase: 'Verify', model: 'fable', schema: RESULT })

return { lanes: fixed.map((f, i) => ({ area: Object.keys(LANES)[i], ok: !!(f && f.ok) })), verify: verify && verify.report }
