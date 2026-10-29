export const meta = {
  name: 'b024-pass3',
  description: 'Three defects in the ported runner, two of them the findings it was meant to carry, recreated inside it',
  phases: [{ title: 'Fix' }, { title: 'Verify' }],
}

const DST = '/Users/mike/Desktop/www/ai-dev-framework'

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, report: { type: 'string', description: 'max 25 lines' } },
  required: ['ok', 'report'],
}

const BRIEF = `You are the Architect (.claude/agents/architect.md) working on the framework template at ${DST}. It is a git repo: 3efc0ee is the pre-harvest baseline, 8409fcf the first pass, HEAD the second.

The template is ABSTRACT — it must not name the project these lessons came from, its domain, or treat its stack as the framework's.

The second pass's reviewer traced the ported runner line by line and found three defects. Two of them are the findings the runner was supposed to carry, recreated inside it, which is worth noticing: a fix is not applied until the thing it fixes stops happening in the fix.

A. \`.claude/workflows/sprint.js\` lines ~115 and ~122: the guard is \`!dev.ok && dev.blockedOn !== 'code'\`. A developer that fails with \`blockedOn: 'none'\` — which the enum permits and a cheap model will certainly emit — is reported as "blocked on none, not escalating": no retry, absent from the blocked list, silently dropped into needsAttention. So the ladder fires only on the literal string 'code' and a plain failure gets neither the retry nor the escalation. Lines 105, 130 and 141 already handle 'none' correctly; make 115 and 122 agree. Decide and state what 'none' with ok=false MEANS — a failure with no kind named is a capability failure until something says otherwise, which is the reading that loses the least.

B. Same file, lines ~47 and ~88: \`LANES.allow\` is a comma-joined string and the prompt prints it as if it were an argument list, so \`check-lane.sh HEAD 'src/a/*, src/b/*'\` flags every file in the lane as a violation. This is FF-12 exactly — the finding about passing the wrong shape to that script — reproduced in the runner that carries the fix. Make \`allow\` an array and print the exact command an agent should run, quoted correctly.

C. Same file: \`head()\` can throw inside \`runTask\`, inside \`parallel\`, AFTER the wave has started. The run then dies with the marker still on disk and \`wave:end\` never runs — which is the failure the comment a few lines above it warns about. Validate the lane and task tables BEFORE starting the wave, and make \`end\` run even when a chain throws.

Also close two smaller items the same reviewer raised:
- \`framework/sprints/SPRINT-000-template/plan.md\` has no "wave started" line, while the playbook says a wave whose plan does not say so was not started. Add it to the template plan.
- \`framework/process/orchestration.md\` says "re-brief once, then one tier up"; the runner goes straight to the tier. Make them agree, and say which you changed and why.

Read the runner in full before editing it. Never commit — the Orchestrator commits. Report at most 25 lines.`

const dev = await agent(BRIEF, { label: 'fix:runner', phase: 'Fix', model: 'fable', schema: RESULT })

const verify = await agent(
  'You are the code-reviewer (.claude/agents/code-reviewer.md). Template at ' + DST + '.\n\n' +
  'The fix pass reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nVerify literally, by reading and by running, not by trusting:\n' +
  '1. Trace every path through sprint.js for a developer result and say what happens for ok=true, and for ok=false with each of none/code/brief/decision/dependency. Name the line numbers. A value that silently vanishes is a defect.\n' +
  '2. Show the exact check-lane command the runner now puts in a brief, and run that command in a scratch copy against a real lane: it must flag a file outside the lane and pass a file inside it.\n' +
  '3. Make a lane table invalid on purpose in a scratch copy, run the runner far enough to see it fail, and confirm no wave marker is left behind. Say exactly how you tested it.\n' +
  '4. Confirm orchestration.md and the runner now say the same thing about re-briefing, and that the template plan has the wave line.\n' +
  '5. One last abstractness grep for the source project\'s name, domain nouns, issue key, and its stack presented as the framework\'s own choice.\n\n' +
  'Then the verdict: is B-024 done? If something remains, say whether it blocks the harvest or is a note for the next project to find. Report at most 30 lines.',
  { label: 'verify3', phase: 'Verify', model: 'fable', schema: RESULT })

return { fix: dev && dev.report, verify: verify && verify.report, ok: !!(verify && verify.ok) }
