// b024-harvest.js — B-024 / CVB-26. One pass, at project end, as the owner decided.
//
// Fifteen findings from the first real build go back into the template. Four
// lanes by file area, then one reviewer who checks the two things that are easy
// to get wrong: that nothing leaked the source project's vocabulary into an
// abstract template, and that every finding is either applied or closed out
// loud with a reason.

export const meta = {
  name: 'b024-harvest',
  description: 'Port fifteen findings from the first real build into the ai-dev-framework template, in one pass',
  phases: [{ title: 'Harvest' }, { title: 'Verify' }],
}

const SRC = '/Users/mike/Desktop/www/ai-cv-builder'
const DST = '/Users/mike/Desktop/www/ai-dev-framework'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    report: { type: 'string', description: 'max 30 lines' },
    applied: { type: 'array', items: { type: 'string' }, description: 'FF ids you applied' },
    closed: { type: 'array', items: { type: 'string' }, description: 'FF ids you deliberately did not apply, each with its reason' },
  },
  required: ['ok', 'report'],
}

const COMMON = `TARGET: ${DST} — the reusable framework template. It is now a git repo; baseline commit 3efc0ee is the state before this harvest, so your work is diffable.
SOURCE OF FINDINGS: ${SRC}/framework/knowledge/framework-feedback.md (FF-01…FF-15, each with evidence and a proposed fix), ${SRC}/framework/knowledge/patterns.md (P-002…P-007) and ${SRC}/framework/knowledge/errors.md (E-001…E-010).
The source project also holds WORKING implementations of several fixes — its own copies of the scripts and rules, proven over two waves and three QA rounds. Port the proven thing rather than re-deriving it, and read the project's version before you write the template's.

THE ONE RULE THAT GOVERNS EVERYTHING HERE: the template is ABSTRACT. It is reused across unrelated products, so it must not name the project that produced these lessons, its domain, or its stack. No "CV", no "ai-cv-builder", no "CVB-NN", no Anthropic, Fastify, Prisma, React or Postgres as if they were the framework's choices, and no "in the pilot we…". A lesson learned from a Postgres queue becomes a lesson about a shared resource. If a concrete example genuinely helps, write a neutral one. A grep for the source project's vocabulary is part of the final check, and it will find you.

Second rule: every finding you touch ends in one of two states — applied, or deliberately closed with a stated reason. "Partly" is not a state. If a fix does not belong in the template, say why in your report and put the reason in the template where the next reader will meet it, not only in your report.

Third: keep the template's existing shape. Root holds only CLAUDE.md and README.md (plus .claude/, .github/, .gitignore, tests/); everything else lives under framework/. CLAUDE.md is a router and stays under about 100 lines. Do not grow a file past the size its own header declares.

Never commit — the Orchestrator commits. Report at most 30 lines.`

const LANES = {

'scripts': `You own: ${DST}/framework/scripts/*, ${DST}/.github/*, ${DST}/.claude/settings.json.

Findings (read each in full before you start):
- FF-02 — gate.config.example.sh's FAST_CHECK runs the type-checker through the package runner, which blocks the very first agent of a new project because dependencies are not installed yet. The project's fix: degrade silently when the binary is absent.
- FF-10 — THE EXPENSIVE ONE. The gate had no lane-scoped mode, so parallel lanes could not pass it: with several lanes in one tree and tests written first, the union is red by construction. It cost a whole wave — a cheap model failed nine of eleven tasks and a stronger model failed nine of nine, which is the signature of a wrong criterion rather than a hard task. The project's fix is a wave mode in gate.config.sh keyed on a marker file, running database + lint + the lane's own tests, with the full five-step gate otherwise. Port the mechanism AND the marker's lifecycle, including that the marker is never committed.
- FF-07 and FF-12 — check-lane.sh. It was blind to untracked files, so in a greenfield project it validated nothing while reporting success; and its second argument is an allowlist FILE while every brief and every agent naturally passes globs, which makes it report every changed path as a violation, including the lane's own. Port the untracked fix, accept globs as trailing arguments, keep the file form, and fail loudly when an allowlist file does not exist instead of silently treating every path as foreign.
- FF-15 — CRITICAL. A fully green gate shipped a product nobody could open: the web container had no route to the api at all, because the api tests call the server in-process and the web tests mock the network, so nothing ever instantiated the seam between them. Add the gate's sixth step: a smoke check that starts nothing, assumes the composed stack is up, and asserts over real HTTP that the app is served, that an API call answers through the SAME origin the browser uses, and that a round trip that sets a session works. It skips with a clear message when nothing is running, and it runs in the full gate and CI only, never in wave mode. The template cannot know the project's URLs, so it ships the step and the example with the project filling in the addresses — the same way gate.config.example.sh already works.
- FF-13 — the Orchestrator is told to commit one task at a time, and a wave by design leaves the tree full of other lanes' finished work, so the one command everyone reaches for first is the one that breaks the rule, invisibly. Give the enforcement a home here: a hook or check that refuses an all-inclusive add while the wave marker exists.

Read the project's working versions first: ${SRC}/framework/scripts/gate.config.sh, check-lane.sh, ${SRC}/tests/smoke/.`,

'process': `You own: ${DST}/framework/process/*.

Findings:
- FF-11 — escalation. The ladder's second rung assumes a failure is a capability problem, so a blocked task was sent to a stronger model to retype the same work. In the source project, after the runner gained a \`blockedOn\` field (code | brief | decision | dependency) where only \`code\` escalates, something striking happened: across two waves and three fix rounds, NOT ONE task returned \`blockedOn: code\`. The capability rung went unused, and four blocks became architecture decisions instead. Write that into the playbook with the strength the evidence deserves, and with the costs the source project also recorded: a blocked lane stalls until the next pass rather than moving to its next task, and agents misuse \`blockedOn\` for defects in files they do own. P-007 in the source has the boundary rule — a block is a successful step, and its boundary is your allowlist.
- FF-01 — the runner recorded a reviewer's fix-list and did nothing with it, so a task shipped with a defect the reviewer had already caught. The loop needs a fix cycle and a re-review, and the reviewer needs a structured place to put blocking items so prose cannot swallow them.
- FF-08 — the lane-brief template produces allowlists that fail their own task: every lane must write its lane log and flip the plan's status row, and neither was ever in the allowlist. Three re-review rounds were lost to it. Fix the template so the always-allowed set is part of it.
- FF-06 — a PATTERN worth promoting: a blocking bootstrap task that creates every file two or more lanes would touch — the registry, the router, the frozen interfaces, the migration — and ships them EMPTY. That is what actually makes lane isolation real, and it is missing from the playbook.
- FF-05 — merge-policy's Mode B assumes a worktree per team, but the runner's isolation wraps a single agent while a lane is several agents sharing a tree. Mode B is not implementable as written. Either rewrite it as what is actually possible or mark it unavailable and say what to do instead — do not leave a mode that cannot be run.
- FF-09 — a reviewer told a developer to "free the port" when a dev server's default port was busy. On a shared developer machine that port belonged to two other projects that had held it for weeks. The remedy is to move your own port, never to kill someone else's process; write that into the playbook as a rule with the reasoning.
- FF-15's process half — the architecture document must name how the parts reach each other at runtime, because in the source project no lane owned that line and every lane assumed another had.
- QA stage: the manual pass found what 691 green tests could not, and it found it at stage 4.5 — after the defect had survived two waves, sixty-six reviews and two integrations. Both halves belong in qa-playbook.md: the stage earns its place, AND it is too late to be the only time the product is opened.

Read ${SRC}/framework/knowledge/framework-feedback.md and patterns.md P-002…P-007 first.`,

'rules': `You own: ${DST}/.claude/rules/* and ${DST}/.claude/agents/*.

The source project rewrote several of these in anger, after each one cost something. Port the proven wording from ${SRC}/.claude/rules/testing.md — read it before writing anything.

- FF-14 — SAFETY. Nothing in the rules says how an agent may DELETE. Asked to undo a probe, a developer removed 57 rows where it had created 3, by name prefix and a ten-minute window. On a shared database that is other people's data. The rule: destructive cleanup names its targets by the ids it collected while creating them — never a prefix, a name pattern, a time window or "everything that looks like mine". It belongs in both the testing and the security rules, and in the developer and test-engineer role files. The source's P-005 has the wording.
- The stub test becomes PERFORMED, not judged: the reviewer names the one line of production code a test exists for, deletes or inverts it, runs the test, requires red, restores, and records the mutation in the fix-list. Reading a test and deciding it looks fine is not this check. In the source project this caught a test whose subject could be deleted with the suite staying green. Where a test's subject is an absence — no secret in a log — the mutation adds the forbidden thing instead.
- A test that pins a leak or a defect is WRONG: when the mutation shows an assertion is protecting the bug, the code changes and the test is rewritten. Two such tests were found in the source project, both pinning a message leak.
- Across a lane boundary, assert the CONTRACT, never the shape. Three integration failures in the source were tests that pinned a sibling lane's temporary shape — true when written, false the moment the owning lane did its job, and invisible to every lane gate. A test may pin the literal shape only of files inside its own lane's allowlist.
- The role files need the matching changes: the reviewer performs the mutation and emits a structured fix-list; the developer and test-engineer clean up by collected id; everyone reports \`blockedOn\` with its boundary.

Keep each rules file short — they are injected into every session, and a rule nobody can hold in their head is a rule nobody follows.`,

'docs': `You own: ${DST}/framework/docs/*, ${DST}/framework/knowledge/*, ${DST}/CLAUDE.md, ${DST}/README.md.

- FF-04 — the architecture template's dependency section never says the TOOLCHAIN belongs in it: the linter, the DOM test environment, the bundler, the type packages. Because "no new dependencies without approval" is a hard rule, agents improvised around the gap three separate times — substituting the type-checker for a linter, a server environment for a browser one, and a type-check for a build. Fix the template section so the toolchain is named.
- FF-03 — the design token file ships as a filled-in example from an unrelated product, so a design lane obeys confidently wrong tokens. Ship it empty with its schema and a comment saying it must be filled, or do not ship it at all. Decide which and say why.
- FF-15's documentation half — the architecture template must have a place where the runtime seam between the parts is named.
- The knowledge files: port P-002…P-007 and the two generalised symptom entries E-009 and E-010 from ${SRC}/framework/knowledge/, ABSTRACTED. P-002 is the most valuable thing in this harvest: four separate incidents in the source project had one cause — the test suite sharing a resource with the running application — and each was fixed correctly on its own, because the error log is grepped by symptom by design and four different error texts never met. The rule it produced: an entry whose fix adds a coordination mechanism names the contended resource on its own line, you grep that before writing the fix, and a SECOND hit on the same resource is not a third entry but an isolation decision.
- Record the harvest itself in the template's own decisions file: what changed in this version and why, so the next reader knows these are field findings and not someone's taste.
- CLAUDE.md: only if the routing table genuinely needs a new row. It is a router under about 100 lines; resist adding to it.

Everything you write must read as if the framework always knew it. No war stories from the source project, no product nouns.`,
}

const harvested = await parallel(Object.entries(LANES).map(([name, brief]) => () => agent(
  'You are the Architect (.claude/agents/architect.md) working on the framework template itself.\n\n' + COMMON + '\n\n=== YOUR AREA: ' + name + ' ===\n\n' + brief,
  { label: 'harvest:' + name, phase: 'Harvest', model: 'fable', schema: RESULT })))

const verify = await agent(
  'You are the code-reviewer (.claude/agents/code-reviewer.md). Project: the framework template at ' + DST + '.\n\n' +
  'Four agents have just ported fifteen findings from the first real build into this template. They reported:\n\n' +
  harvested.map((h, i) => (h ? '— ' + Object.keys(LANES)[i] + ': ' + h.report : '— ' + Object.keys(LANES)[i] + ': (no report)')).join('\n\n') +
  '\n\nVerify three things, and do not take any claim on trust.\n\n' +
  '1. ABSTRACTNESS. The template is reused across unrelated products. grep the whole tree, case-insensitively, for the source project\'s vocabulary — its name, its domain nouns, its issue key, and the specific technologies it happened to use as if they were the framework\'s. Report every hit with file and line. A neutral example is fine; a product noun is not.\n' +
  '2. COVERAGE. Read ' + SRC + '/framework/knowledge/framework-feedback.md and check each of FF-01…FF-15 against the template as it now stands. For each: applied (say where, by file and what changed), or closed with a stated reason that a reader will actually find in the template. Anything neither is a gap and you name it.\n' +
  '3. THE TEMPLATE STILL WORKS. Run bash framework/scripts/gate.sh in the template — it has no project config, so it must degrade cleanly and say so rather than erroring. Run framework/scripts/check-lane.sh with both an allowlist file and trailing globs, and confirm both forms behave and that a missing file fails loudly. Confirm the root still holds only CLAUDE.md and README.md besides the dot-directories and tests/, that CLAUDE.md is still a router under about 100 lines, and that no file contradicts another — especially the merge policy against the sprint playbook on lane isolation, and the testing rule against the reviewer role file on the mutation check.\n\n' +
  'Report at most 35 lines: the abstractness hits, the FF coverage verdict, the command outcomes, and anything you would send back.',
  { label: 'verify', phase: 'Verify', model: 'fable', schema: RESULT })

return {
  lanes: harvested.map((h, i) => ({ area: Object.keys(LANES)[i], ok: !!(h && h.ok), applied: h && h.applied, closed: h && h.closed })),
  verify: verify && verify.report,
}
