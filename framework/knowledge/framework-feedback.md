# framework-feedback.md — defects found in the framework itself

> **What this file is:** the running log of problems in the **template**
> (`/Users/mike/Desktop/www/ai-dev-framework`), found while building a real
> product with it. `errors.md` holds this project's bugs; `patterns.md` holds
> this project's reusable solutions; neither is the right home for "the
> framework made us do the wrong thing", which is what this file collects.
> **Who writes it:** anyone who hits one — at the moment they hit it, not from
> memory at the retro. **Who reads it:** the session that does B-024.
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
