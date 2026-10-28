# task-lifecycle.md — time tracking and the local↔Jira task flow

> **What this file is:** how a task lives from "in progress" to "done":
> where time is tracked, when Jira is updated, and who moves statuses.
> Principle: **local files are the source of truth, Jira mirrors them** —
> and the mirror is updated at defined moments, not continuously.

## Time tracking

- Every agent working a task records time in its lane-report block:
  `- time: <start→end local, ~h:mm>` — actual elapsed work time per role
  (tests / code / review / hotfix), summed into the task's total.
- The Teamlead's estimate lives in the plan (`size ~2h`); estimate vs
  actual lands in the sprint report's process signals — a systematic gap
  means decomposition needs fixing, and `/retro` looks at exactly that.
- On Jira sync, totals are written as **worklogs** on the mirrored issue
  (per-role lines in the worklog comment). Company worklog conventions
  (daily caps, assignee rules) are recorded in `framework/process/integrations.md`'s
  config block — ask the owner once, then follow.

## Status flow (one task)

```
local work (TDD loop, gates, review)         Jira: In Progress (+worklog)
   ↓ lane done, gates green
owner pushes to git  ──────────────────────▶ agents sync: comment «pushed,
   ↓                                         awaiting staging deploy»,
   │                                         status → Ready for test,
   │                                         worklogs written
owner confirms staging is deployed ◀──────── Orchestrator ASKS the owner
   ↓                                         (one short question, batched
qa-engineer tests staging (/qa scope =       for all pushed tasks)
   the pushed tasks' pages/flows)
   ↓ findings → /hotfix or back to lane; re-push repeats the loop
QA ok → qa-report updated, Jira comment
   «staging OK: <evidence>»
   ↓
status forward (Done / Ready for release):
   • normal tasks — automatic, with a closing comment;
   • tasks labeled critical (payments, migrations, security, data
     deletion) — only after the owner's explicit yes.
```

## Rules

- **Push is the owner's act.** Agents never push; the sync to Jira happens
  when the owner says "pushed" or the Orchestrator sees the push (CI run).
- **No lying to the mirror:** a Jira status may never be ahead of local
  reality (nothing is "Ready for test" before the gate is green and the
  push happened). If sync fails, the task's local block notes
  `jira: sync pending` — silence is forbidden.
- **Critical label** is set by the Teamlead at planning (risk areas list in
  `/code-review` skill applies) and mirrored to Jira; it controls the final
  transition above.
- Batch, don't spam: one sync pass per push covers all affected tasks; one
  staging-confirmation question covers the batch.
