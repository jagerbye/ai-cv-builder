# framework-feedback.md — defects found in the framework itself

> **What this file is:** the running log of problems in the **template**
> (`/Users/mike/Desktop/www/ai-dev-framework`), found while building a real
> product with it. `errors.md` holds this project's bugs; `patterns.md` holds
> this project's reusable solutions; neither is the right home for "the
> framework made us do the wrong thing", which is what this file collects.
> **Who writes it:** anyone who hits one — at the moment they hit it, not from
> memory at the retro. **Who reads it:** the session that does B-024.
>
> **When these get applied: at project end, in one pass** (owner's decision,
> 2026-10-28). Not per sprint and not in pieces — every wave adds entries, and
> a finding seen three times is described better than one patched after the
> first. There is no urgency: each proven fix already runs in this repo's own
> copy of the framework, so the port benefits the *next* project.
>
> Every entry carries **evidence** (a path and line in the template, or a lane
> report quote), because a fix applied to a symptom nobody can reproduce makes
> the framework worse, not better.

Format:

```
## FF-NN <one-line symptom>  (found YYYY-MM-DD, severity: bug | gap | drift)
- Evidence: <template path:line, or lane report / task id>
- What it cost here: <what actually went wrong, concretely>
- Why it recurs: <why every project built from this template hits it>
- Proposed fix: <the change to the template>
- Status: open | fixed in template (date)
```

---

## FF-01 The sprint runner ignores a reviewer's fix-list (found 2026-10-28, severity: bug)

- Evidence: `.claude/workflows/sprint.js:45` — `return { id: t.id, dev: dev.ok,
  review: review.ok, ... }`. The review verdict is recorded and the task ends;
  there is no path from "not approved" back to a developer.
- What it cost here: T-01 was reviewed, the reviewer found that
  `api/package.json` declared **no runtime dependencies at all** despite the
  developer's report listing six as pinned — and the task still completed.
  The whole sprint would have been built on a workspace that cannot import
  Fastify or Prisma.
- Why it recurs: the escalation ladder in `model-routing.md` covers a
  developer *failing*, not a reviewer *rejecting*. Every project using the
  runner inherits a review step whose verdict changes nothing.
- Proposed fix: add the fix cycle to the template runner — on `!review.ok`,
  one developer pass on the next model tier with the fix-list in the prompt,
  then a re-review that checks the list item by item. Implemented in this
  project's copy of `sprint.js`; port it back.
- Status: open

## FF-02 FAST_CHECK blocks the first agent of every new project (found 2026-10-28, severity: bug)

- Evidence: `framework/scripts/gate.config.example.sh:17` —
  `FAST_CHECK='... npx tsc --noEmit ...'`.
- What it cost here: before `node_modules` exists, `npx tsc` downloads or
  fails, and `hook-postedit.sh` turns that into `exit 2`, which is fed back to
  the editing agent as a blocking error. The very first task of a project is
  the scaffold, so the first agent to write a file is the one that gets
  blocked.
- Why it recurs: the example config assumes a toolchain that only exists
  after the task it is blocking.
- Proposed fix: make the example's FAST_CHECK a no-op until the toolchain is
  present — `[ -x node_modules/.bin/tsc ] || return 0` — and say in the
  comment that a fast check must degrade silently, never block, when the
  project is not yet installable.
- Status: open

## FF-03 design.json ships as a filled-in example of a different product (found 2026-10-28, severity: bug)

- Evidence: `framework/docs/design/design.json` → `meta.type` is
  `"Dashboard / SaaS admin panel"`, with a 96px dark sidebar, lime accent and
  bento grid.
- What it cost here: the web lane is briefed to take its tokens from that
  file. Left alone it would have built an AI CV Builder styled as an analytics
  dashboard. A confidently wrong token set is worse than an empty one, because
  nothing signals that it needs replacing.
- Why it recurs: any project that does not run `/design` before its first web
  task inherits another product's design decisions as if they were its own.
- Proposed fix: ship a token **skeleton** with the same shape but empty
  values and `meta.type: "REPLACE ME — run /design"`, and have the design
  playbook assert the file was replaced before a web lane may read it.
- Status: open

## FF-04 The dependency list does not cover the toolchain (found 2026-10-28, severity: gap)

- Evidence: `framework/docs/architecture.md` §1 asks for "Languages,
  frameworks, versions, and WHY each" and never mentions linter, test
  environment, bundler or type packages. `.claude/rules/coding-standards.md`
  forbids adding a dependency without approval.
- What it cost here: **twice**. First round: no ESLint, no DOM test
  environment, no bundler, so the developer substituted `tsc` with extra flags
  for `lint`, ran web tests in Node, and made the web "build" a type-check —
  a green gate that checked almost nothing. Second round, after that was
  fixed: no `@types/react`, so no `.tsx` type-checked, `web/src/main.ts`
  mounted nothing, and the shell could not be written at all.
- Why it recurs: "no new dependencies without approval" is only a safe rule
  while the approved list is complete. An incomplete list does not prevent
  improvisation — it forces it, and the improvisation lands in the gate, where
  it is invisible.
- Proposed fix: the architecture template's §1 comment names the toolchain
  explicitly as in scope (linter, formatter, test runner **and environment**,
  bundler, type packages, install-script policy), and `architect.md` gains a
  completeness check: "could a developer run every gate step with only this
  list installed?"
- Status: open

## FF-05 Mode B (worktrees per team) is not implementable as written (found 2026-10-28, severity: drift)

- Evidence: `framework/process/merge-policy.md:17-21` — "Each team gets its
  own **git worktree** on its own branch". The Workflow tool's
  `isolation: 'worktree'` applies to **one agent**.
- What it cost here: nothing yet — it was caught while planning, and lane
  isolation was bought with strictly disjoint file areas instead (ADR-011).
  It would have cost a wasted wave: a lane is three agents
  (test-engineer → developer → reviewer) that must share a tree, and in
  per-agent worktrees the developer would never see the tests that were
  written for it.
- Why it recurs: the policy was written for human teams and inherited by an
  agent runner whose isolation granularity is different.
- Proposed fix: say in merge-policy that worktrees isolate an **agent**, not a
  lane; a lane's agents share a tree. Mode B therefore means one worktree per
  lane created and torn down *around* the lane by the orchestrator/runner —
  or, until that exists, Mode A with disjoint paths is the only supported
  mode and the playbook should say so.
- Status: open

## FF-06 PATTERN: a bootstrap task that owns every shared file (found 2026-10-28, severity: gap)

Not a defect — the thing that actually made six-way parallelism work, and it
is nowhere in the playbook.

- Evidence: this sprint's T-07 (api) and the same trick inside T-05 (web).
- What it bought: a registry file (`server.ts`, the web router) and the
  cross-lane type modules are created **before** the wave, each lane then
  owning exactly one leaf module. No lane ever edits a file another lane owns,
  so Mode A isolation is real rather than aspirational, and `check-lane.sh`
  can enforce it mechanically.
- Proposed fix: add to `sprint-playbook.md` §1 — when a wave has more than
  two lanes, the first task of the blocking prologue creates every file two or
  more lanes would otherwise touch (registries, routers, frozen interfaces,
  migration), and ships it empty. Add the pattern to `patterns.md`.
- Status: open

## FF-07 check-lane.sh is blind to untracked files (found 2026-10-28, severity: bug)

- Evidence: `framework/scripts/check-lane.sh` fed its file list from
  `git diff --name-only "$base"` alone.
- What it cost here: in a greenfield project most of a lane's output is **new
  files**, and `git diff` never lists untracked paths. T-07 created eight files
  and the check saw none of them — it would have reported "lane ✓ diff stays
  inside the allowlist" while validating nothing. The reviewer caught it by
  noticing that every violation listed belonged to *other* lanes.
- Why it recurs: the check is most needed exactly when a project is young and
  files are being created, which is precisely when it was inert.
- Proposed fix: union the tracked diff with
  `git ls-files --others --exclude-standard`. Done in this project's copy and
  proved with an untracked probe file; port it back.
- Status: open

## FF-08 The lane-brief template produces allowlists that fail their own task (found 2026-10-28, severity: gap)

- Evidence: `framework/process/sprint-playbook.md` §2 — the brief template's
  "Files you may touch" line, and the same §'s "Report to: …/lanes/lane-NN.md"
  line, which names a file the allowlist never includes.
- What it cost here: three re-review rounds across T-01, T-02 and T-07, none
  of them about code. Every lane must write its own lane log and flip its row
  in `plan.md` — the playbook *instructs* this — yet both files are violations
  under the allowlist the same playbook tells you to write. T-01's allowlist
  additionally omitted files the task obviously had to create (`.nvmrc`,
  entry points, `index.html`), because the Teamlead wrote the list from the
  criteria rather than from the deliverable.
- Why it recurs: the template invites a list of files to *edit*, while the
  check measures files that *changed*, and process files change on every task.
- Proposed fix: the template gains a standing allowance — the lane's own log,
  `plan.md`, and anything the task is required to create — and the playbook
  says the allowlist is written from the deliverable, not from the criteria.
- Status: open

## FF-09 "Free the port" is the wrong remedy on a developer machine (found 2026-10-28, severity: gap)

- Evidence: T-02's review fix-list — "Host port 5173 is still held by node
  PIDs 3057 and 43048. Free the port".
- What it cost here: nothing, because the Orchestrator checked what held the
  port first: two long-running vite dev servers belonging to the owner's other
  projects, up 27 and 7 days. Following the instruction would have killed
  them.
- Why it recurs: an agent sees a port conflict as an environment fault to
  clear, with no notion that the machine is shared with work it cannot see.
- Proposed fix: a line in `rules/security.md` or the local-development
  runbook — an agent never kills a process or frees a port it did not start;
  it reports the conflict and moves its own port. Compose host ports should be
  env-overridable by default for the same reason.
- Status: open

## FF-10 The gate has no lane-scoped mode, so parallel lanes cannot pass it (found 2026-10-28, severity: bug)

- Evidence: `framework/scripts/gate.sh` runs whatever `GATE_STEPS` says and
  nothing else; the example config's steps are whole-project
  (`npm test`, `tsc --noEmit`). `framework/knowledge/errors.md` E-001 already
  says execution-phase runs must be lane-scoped and the union belongs to the
  Integrator — but there is no mechanism to do it, and `hook-stop.sh` enforces
  the union on every agent's turn end regardless.
- What it cost here: an entire wave. Of 11 developer steps, 9 reported
  failure — and **all 9 Sonnet escalations failed too**, which is the tell: a
  stronger model failing identically means the criterion is wrong, not the
  worker. Every review and every re-review returned "not approved". The
  escalated agents diagnosed it correctly and refused to touch code: *"The
  brief is defective: it asks for the whole-repo gate.sh to go green from one
  lane while the other wave-A lanes are unfinished."* Tests come first by
  rule, so a sibling lane always has tests whose implementation does not exist
  yet; the union is red for the whole wave by construction.
- Why it recurs: the framework prescribes parallel Mode-A lanes on one tree
  AND tests-first AND a union gate enforced by a hook. Any two of those three
  are fine; all three together cannot be satisfied.
- Proposed fix: `gate.config.example.sh` ships a wave mode — while a
  `.wave-in-flight` marker exists, the gate checks lint plus `GATE_LANE_TEST`
  only, and the Integrator forces the union with `GATE_FULL=1`. The Stop hook
  then stops failing agents for their neighbours' work. Implemented here;
  port it back. The sprint-playbook should also state plainly that during a
  wave "green" means the lane, and `hook-stop.sh` must not enforce the union.
- Status: open

## FF-11 Escalation is a brief-quality signal the runner throws away (found 2026-10-28, severity: gap)

- Evidence: `model-routing.md` says "a task that defeats Sonnet is almost
  always mis-decomposed or under-specified, not too hard", and the runner does
  escalate — but it escalates **silently into another coding attempt**.
- What it cost here: with the gate fixed, wave A's four escalations turned out
  to be four *decisions that belonged to the Architect*, not coding failures.
  Every escalated agent said so in its own words and correctly refused to
  write code: a missing dependency (`@fastify/multipart`, never in §1), a rule
  that contradicted its own golden fixture, and a lane test glob that swept a
  sibling lane's suite. Sending a stronger model to retype the same task
  cannot resolve any of them — it just pays twice to be told the same thing.
- Why it recurs: the ladder's second rung assumes the failure is capability.
  When the failure is specification, the correct next actor is the Orchestrator
  or the Architect, and nothing routes there.
- Proposed fix: the agent result schema gains a `blockedOn` field —
  `code | brief | decision | dependency`. Only `code` escalates to the next
  model tier; the other three stop the task and surface it to the Orchestrator
  immediately, with the lane continuing to its next independent task. Cheap to
  add, and it converts a wasted Sonnet pass into a one-line question.
- Status: open

## FF-12 `check-lane.sh` takes a FILE, and every agent passes globs (found 2026-10-29, severity: friction)

- Evidence: `framework/scripts/check-lane.sh:6` — `usage: check-lane.sh
  <base-ref> <allowlist-file>`. The second argument is read with
  `done < "$list"`, so a glob list on the command line makes the script read a
  file named `api/src/http/**, api/src/server.ts, …`, which does not exist:
  every changed path then falls through as a violation, **including the one
  file the lane legitimately owns**.
- What it cost here: in wave B, three agents hit it. Two reviewers (lanes 08
  and 10) diagnosed it themselves and wrote a temporary allowlist file to a
  scratch directory to get a real answer; one developer reported its own lane
  as violating its own allowlist. The failure mode is the dangerous direction
  — it reports violations that are not there, so a lane that is genuinely
  clean looks dirty and the round is spent arguing.
- Why it recurs: the plan and the brief both describe a lane's area as a list
  of globs, because that is how humans and agents talk about it. Nothing
  converts that list into the file the script wants, so every agent invents the
  conversion — or forgets to.
- Proposed fix: accept globs as trailing arguments
  (`check-lane.sh <base> 'api/src/http/**' 'api/src/server.ts'`) and keep the
  file form behind `-f <file>`. Then fail loudly when the second argument looks
  like a glob but is being read as a path: `[ -f "$list" ] ||` exit with
  "allowlist file not found" instead of reporting every path as a violation.
  Better still, the sprint runner writes one allowlist file per lane from
  plan.md, so the brief and the check read the same source.
- Status: open

## FF-13 "The Orchestrator commits per task" is a promise nothing enforces (found 2026-10-29, severity: process)

- Evidence: ADR-009 in this project (and `framework/process/merge-policy.md` in
  the template) says one commit per finished task, written by the Orchestrator.
  During wave B the Orchestrator ran `git add -A` to commit an ADR, and swept
  five lanes' approved-but-uncommitted work into a commit whose message
  describes only the ADR. Caught by reading `git show --stat`, not by anything
  in the framework.
- Why it is structural, not carelessness: a wave by design leaves the tree full
  of other lanes' finished work — that is what "lanes share one tree, the
  Integrator merges" means. So the one command every agent reaches for first is
  precisely the command that violates the rule, and the violation is invisible
  at the moment it happens.
- What it cost here: a 3 000-line commit whose message names one decision;
  recovered with `git reset --mixed` and four coherent commits, which is only
  possible because nothing had been pushed.
- Proposed fix: the sprint runner writes each lane's file list (it already has
  the allowlist file — FF-12), and the Orchestrator commits with
  `git add --pathspec-from-file`, never `-A`, during a wave. A pre-commit hook
  can refuse `git add -A` while `framework/scripts/.wave-in-flight` exists.
  Also state in merge-policy.md that files one task could not separate — a
  wiring file several tasks edit — are committed together with the reason in
  the message, rather than split into commits that do not build.
- Status: open
