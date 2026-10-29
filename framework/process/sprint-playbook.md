# sprint-playbook.md — the sprint lifecycle

> **What this file is:** the repeatable procedure a sprint follows, including
> the TDD loop and the lane-task template. The `/sprint` skill executes this
> playbook; `.claude/workflows/sprint.js` automates stages 2–4.

## 0. Inputs

A sprint starts only when it has: prioritized items in `framework/sprints/backlog.md`
(PM), frozen contracts for anything cross-boundary (Architect), and a sprint
folder copied from `framework/sprints/SPRINT-000-template/`.

## 1. Planning (Teamlead, reviewed by Architect)

- Split backlog items into **lanes**: one lane = one team = one disjoint set
  of files/components. ≤3 lanes per sprint unless the Integrator budget is
  raised on purpose (more lanes = cheaper dev, costlier merge).
- Split each lane into **tasks ≤ ~2h of work**, each with: goal, acceptance
  criteria (from spec), exact file list, doc sections to read, out-of-scope.
- **The allowlist is written from the deliverable, not from the criteria.**
  List every file the task must create or change to be done — entry points,
  config, fixtures, the registry line it registers into — not only the files
  the criteria mention. A list derived from the criteria omits the files the
  task obviously has to make, and the lane fails its own isolation check for
  work it was told to do.
- **Bootstrap task (whenever a wave has more than two lanes):** the first,
  blocking task of the wave does two things, and it is not done until both
  hold.
  *The shared files, empty:* it creates every file two or more lanes would
  otherwise touch — the service registry, the client router, the frozen
  interface modules, the migration — and ships them **empty**. After it, each
  lane owns exactly one leaf module and adds one line to a registry it does
  not own only through the frozen contract. This is what makes disjoint lanes
  real rather than aspirational, and what lets `check-lane.sh` enforce them
  mechanically: without it the shared files are edited by everyone and the
  plan's isolation is a promise.
  *The runtime seam, proved:* it composes the stack the way it will run —
  the served client, the server behind it, whatever the client calls
  reaching the service **through the origin a user would use** — starts it,
  and reaches the front door; it fills the smoke variables in
  `gate.config.sh` so the smoke step (here `tests/smoke/`) has a target from
  this point on. Unit and
  integration suites never instantiate that seam (server suites call
  handlers in-process, client suites mock the transport), so a wave that
  skips this step builds on an assumption nobody has tested. In the first
  real build nothing opened the product until manual QA, and the missing
  seam had by then survived two waves, sixty-six reviews and two
  integrations. The bootstrap is where that is caught at the cost of one
  task instead of a sprint.
- **The wave marker:** a wave with parallel lanes runs under
  `framework/scripts/wave.sh start` (Orchestrator, before the first lane's
  first brief goes out). While the marker is up the gate judges a lane by
  lint plus its own tests; the union belongs to the Integrator, who ends the
  wave (§4). Plan.md records that the wave was started; a wave whose plan
  does not say so was not.
- Write `plan.md` + one `lanes/lane-NN.md` per lane. The plan records the
  sprint's **base ref** and the **status board** (task × lane × depends-on ×
  status) — the board is the sprint's live state; lane files stay the log.
- Architect checks: no two lanes touch the same files; every cross-lane
  dependency goes through a frozen contract; **`architecture.md` names how the
  parts reach each other at runtime** (which origin the client calls, who
  proxies, who starts the worker) — a seam no lane owns is one every lane
  assumes another has built. Overlap unavoidable → that lane pair runs
  sequentially (merge-policy.md, Mode B).

## 2. Lane brief template (what a dev/test agent receives)

```
Task <id>: <goal, one sentence>
Acceptance criteria: <copied, not referenced>
Files you may touch: <exact list, from the deliverable>
  — plus, always: this task's lane log, plan.md (your status row), and any
  file the criteria require you to create. These are part of every allowlist;
  a brief that omits them fails its own task.
Read first: <paths + doc §§, max ~5 items>
Test command for THIS lane: <exact lane-scoped command — never the bare
  union runner while other lanes are in flight; see framework/knowledge/errors.md E-001>
  Run it as: export GATE_LANE_TEST='<that command>' before any gate.sh call,
  and say so in your lane log. (The gate is lane-scoped while the wave is in
  flight; it reads this variable. Unset, the gate is lint only and a green
  pass proves nothing — the reviewer will treat it as no tests run.)
Do NOT: touch other files, weaken tests, install deps, change contracts,
  kill a process or free a port you did not start (move your own port).
Before coding: grep framework/knowledge/errors.md for <relevant keywords>.
If you cannot proceed: set blockedOn (code | brief | decision | dependency),
  say exactly what you need, and stop — reporting a block is a successful
  step, and you do not write yourself an ADR. A block is valid only for what
  your allowlist or this brief cannot settle: a defect in a file you own,
  including your own test files, is your task (patterns.md P-007).
Report to: framework/sprints/<sprint>/lanes/lane-NN.md (append your task block).
```

## 3. Execution — the TDD loop (per task)

```
test-engineer: write failing tests from acceptance criteria  → RED verified
developer:     write code until tests pass                   → GREEN
gates:         gate.sh under the wave marker = lint + GATE_LANE_TEST
               (this lane's suite) → green or loop; the union is not
               this lane's criterion while others are in flight
reviewer:      diff vs criteria + spot-run + the mutation    → approve / fix-list
fix cycle:     on fix-list → developer clears it item by item (next model
               tier, list in the prompt) → reviewer RE-REVIEWS the list item
               by item. One cycle; still rejected → Orchestrator.
on a block:    blockedOn=code → escalation ladder (model-routing.md);
               brief | decision | dependency → the Orchestrator, no tier
               change. Log the cause and fix candidate in the lane report.
```

- **A fix-list the runner does nothing with is a defect that shipped
  reviewed.** The reviewer's result carries blocking items as a structured
  list (`fixes: [...]`), one per line, separate from the prose report — prose
  gets summarized away; the list is what the fix pass and the re-review are
  measured against. `ok=false` with an empty list is an invalid verdict.
- **The reviewer's two mechanical checks** (reading is neither of them): the
  *mutation* — name the line of production code each test exists for, delete
  or invert it, run, require RED, restore, record the mutation performed in
  the fix-list; and *test ownership* — a test about a file outside the lane's
  allowlist may assert only what a frozen contract names, never a literal
  shape, because nothing downstream of the lane gate can catch that until the
  union (`framework/knowledge/errors.md` E-010, E-003; `patterns.md` P-004,
  P-006).

Each agent flips the task's row on the plan's status board as it finishes its
step (`red` / `green` / `done`); a task whose dependencies are not `done` does
not start — dependency order lives on the board, not in anyone's memory.

**If the wave was never started** (`wave.sh status` says "none" while lanes
are in flight): every gate run executes the full union against a tree full of
half-finished lanes, every lane goes red on its neighbours' missing modules,
and escalating the model changes nothing — a stronger model failing every
task identically is the signature of a wrong criterion. Stop the lanes,
`wave.sh start`, re-run the gates; do not escalate a single failure first.

A task is **done locally** when: tests green, gates green, review approved,
lane report updated (incl. the `time:` line — framework/process/task-lifecycle.md),
touched docs updated (docs-sync rule). After the owner's push it continues
through the staging flow: Jira sync → staging confirmation → QA on staging →
status forward (auto; critical-labeled tasks only after the owner's yes) —
see `framework/process/task-lifecycle.md`.

## 4. Integration (Integrator, strongest model)

- Merge lanes one by one into the sprint branch; before each, `check-lane.sh`
  with that lane's globs; after EACH merge run the union of all tests —
  `GATE_FULL=1 framework/scripts/gate.sh`, because under the wave marker a
  bare `gate.sh` is lane-scoped and will pass anything — not only at the end.
- After the last merge is green: `framework/scripts/wave.sh end`. It removes
  the marker and runs the full gate, smoke step included; the sprint's
  integration is reported as that run's result. **A marker nobody ended** is
  the quiet failure: every later gate, Stop hook and session keeps judging
  by lint plus whatever `GATE_LANE_TEST` happens to be set, the smoke step
  never runs, and the next wave starts on an unverified tree. The Integrator
  owns `end`; the Orchestrator checks `wave.sh status` says "none" before
  stage 4.5 opens.
- Sequential (Mode B) lanes: see merge-policy.md.
- Any conflict resolution that changes behavior → note in the sprint report;
  if it reveals a contract gap → ADR.
- **The union is not the product.** Server suites that call handlers
  in-process and client suites that mock the transport are each correct, and
  neither instantiates the seam between them — so a fully green union can
  ship something nobody can open. The full gate carries a smoke step that
  drives the composed stack over the real transport on the real ports; it
  never runs in wave mode (patterns.md P-003). The seam itself is named in
  `architecture.md` at planning (§1), not discovered at QA.

## 4.5 Manual QA (qa-engineer, per framework/process/qa-playbook.md)

- After integration, on the pages/flows the sprint touched + core smoke:
  real browser, functional pass AND visual pass at desktop + mobile
  viewports, screenshots as evidence → `qa-report.md` in the sprint folder.
- Triage: **blocker** → back to the owning lane, the sprint cannot close;
  major/minor/visual → `/hotfix` (cheap loop: one Haiku dev per batch,
  gates still green, QA re-checks only the fixed screens).
- This stage is not the first time the product is opened: the bootstrap
  task (§1) ends with the stack started and its front door reached, and the
  smoke step (§4) runs in every full gate. QA at 4.5 is the last net, not
  the only one — see qa-playbook.md on why.
- Projects with no UI skip this stage and say so in the report.

## 5. Close & retro

- `report.md`: what shipped (by feature, owner's language), what slipped and
  why, QA findings summary, escalations and blocks by `blockedOn` kind, token
  notes if available.
- Append the sprint's block to `framework/sprints/HISTORY.md` (the chronological log:
  shipped / bugs & how fixed / went well / went badly) — newest on top,
  never edited retroactively.
- Run `/retro`: harvest errors→`framework/knowledge/errors.md`, reusable solutions→
  `framework/knowledge/patterns.md`, recurring brief problems→fix this playbook.
- **The contended-resource pass:** list every fix of the sprint that added or
  tightened a coordination mechanism — a lock, a cleanup rule, a guard, an
  ordering convention, a "remember to" — and group them by the resource they
  protect (a queue, a shared database, a host port, a registry file), not by
  their symptom. Two mechanisms over one resource is not two entries: it is
  an isolation decision, and it goes to an ADR. Recurring causes hide here,
  because each occurrence reaches a different agent with a different error
  (patterns.md P-002, errors.md E-009; ADR-019 cost four incidents to find).
- PM updates backlog; unfinished tasks return to backlog, never silently
  roll over.
