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
- Write `plan.md` + one `lanes/lane-NN.md` per lane. The plan records the
  sprint's **base ref** and the **status board** (task × lane × depends-on ×
  status) — the board is the sprint's live state; lane files stay the log.
- Architect checks: no two lanes touch the same files; every cross-lane
  dependency goes through a frozen contract. Overlap unavoidable → that lane
  pair goes to worktree mode (merge-policy.md).

## 2. Lane brief template (what a dev/test agent receives)

```
Task <id>: <goal, one sentence>
Acceptance criteria: <copied, not referenced>
Files you may touch: <exact list>
Read first: <paths + doc §§, max ~5 items>
Test command for THIS lane: <exact lane-scoped command — never the bare
  union runner while other lanes are in flight; see framework/knowledge/errors.md E-001>
Do NOT: touch other files, weaken tests, install deps, change contracts.
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
gates:         typecheck + lint + full lane test run         → green or loop
reviewer:      diff vs criteria + spot-run + THE MUTATION     → approve / fix-list
on blockedOn=code: escalation ladder (model-routing.md); any other blockedOn
                   returns to the Orchestrator and does not change model tier
                   (patterns.md P-007). Log the error+fix candidate in the lane
                   report either way.
```

**The reviewer's two mechanical checks** (reading is not either of them):
- *The mutation* — for each criterion, name the line of production code its
  test exists for, delete or invert it, run the test, require RED, restore,
  and write the mutation performed into the fix-list. A suite that stays green
  under the mutation is decoration (`.claude/rules/testing.md`,
  framework/knowledge/errors.md E-010, patterns.md P-004).
- *Test ownership* — run the files each new test names against the lane's
  allowlist. An assertion about a file another lane owns must quote a frozen
  contract, never a literal shape; nothing downstream of the lane gate can
  catch this (errors.md E-003, patterns.md P-006).

Each agent flips the task's row on the plan's status board as it finishes its
step (`red` / `green` / `done`); a task whose dependencies are not `done` does
not start — dependency order lives on the board, not in anyone's memory.

A task is **done locally** when: tests green, gates green, review approved,
lane report updated (incl. the `time:` line — framework/process/task-lifecycle.md),
touched docs updated (docs-sync rule). After the owner's push it continues
through the staging flow: Jira sync → staging confirmation → QA on staging →
status forward (auto; critical-labeled tasks only after the owner's yes) —
see `framework/process/task-lifecycle.md`.

## 4. Integration (Integrator, strongest model)

- Merge lanes one by one into the sprint branch; after EACH merge run the
  union of all tests — not only at the end.
- Worktree lanes: see merge-policy.md.
- Any conflict resolution that changes behavior → note in the sprint report;
  if it reveals a contract gap → ADR.
- **The union is not the product.** Suites that call the server in-process and
  suites that mock `fetch` are each correct and neither instantiates the seam
  between them, so a fully green union can ship something nobody can open. The
  full gate therefore carries a `smoke` step that drives the composed stack
  over real HTTP (patterns.md P-003); it never runs in wave mode. A seam no
  component owns — how the browser reaches the api, who starts the worker — is
  named in `architecture.md` at planning time, or every lane assumes another
  lane had it.

## 4.5 Manual QA (qa-engineer, per framework/process/qa-playbook.md)

- After integration, on the pages/flows the sprint touched + core smoke:
  real browser, functional pass AND visual pass at desktop + mobile
  viewports, screenshots as evidence → `qa-report.md` in the sprint folder.
- Triage: **blocker** → back to the owning lane, the sprint cannot close;
  major/minor/visual → `/hotfix` (cheap loop: one Haiku dev per batch,
  gates still green, QA re-checks only the fixed screens).
- Projects with no UI skip this stage and say so in the report.

## 5. Close & retro

- `report.md`: what shipped (by feature, owner's language), what slipped and
  why, QA findings summary, escalations count, token notes if available.
- Append the sprint's block to `framework/sprints/HISTORY.md` (the chronological log:
  shipped / bugs & how fixed / went well / went badly) — newest on top,
  never edited retroactively.
- Run `/retro`: harvest errors→`framework/knowledge/errors.md`, reusable solutions→
  `framework/knowledge/patterns.md`, recurring brief problems→fix this playbook.
- **The contended-resource pass** (the retro's one non-obvious step): list every
  fix of the sprint that added or tightened a coordination mechanism — a lock,
  a cleanup rule, a guard, an ordering convention, a "remember to" — and group
  them by the resource they protect, not by their symptom. Two mechanisms over
  one resource is not two entries: it is an isolation decision, and it goes to
  an ADR. Recurring causes hide here, because each occurrence arrives with a
  different error text to a different agent (patterns.md P-002, errors.md
  E-009; this is what ADR-019 cost four incidents to find).
- PM updates backlog; unfinished tasks return to backlog, never silently
  roll over.
