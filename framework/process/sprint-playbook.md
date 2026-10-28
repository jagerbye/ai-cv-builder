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
Report to: framework/sprints/<sprint>/lanes/lane-NN.md (append your task block).
```

## 3. Execution — the TDD loop (per task)

```
test-engineer: write failing tests from acceptance criteria  → RED verified
developer:     write code until tests pass                   → GREEN
gates:         typecheck + lint + full lane test run         → green or loop
reviewer:      diff vs criteria + spot-run                   → approve / fix-list
on repeat failure: escalation ladder (model-routing.md), log the error+fix
                   candidate in the lane report
```

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
- PM updates backlog; unfinished tasks return to backlog, never silently
  roll over.
