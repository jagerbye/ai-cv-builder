# Sprint NN — plan

> **What this file is:** the Teamlead's plan for one sprint: goal, lanes,
> mode per lane, and the task list each lane owns. Copy the whole
> `SPRINT-000-template/` folder to `SPRINT-NNN-<name>/` and fill in.

- **Goal (owner's language):** <one sentence: what the owner gets>
- **Backlog items:** B-NNN, B-MMM
- **Contracts frozen:** C-NNN (list; "none" is a valid answer)
- **Base ref:** <commit/branch the sprint branches from — what `check-lane.sh`
  and reviewers diff against>
- **Dates:** start → target

## Lanes

| Lane | Team/agent set | Mode (A disjoint / B worktree) | Files area | Tasks |
|---|---|---|---|---|
| 01 | tests+dev+review | A | `src/<area>/**` | T-01…T-04 |

## Status board

The sprint's "now", one row per task — agents update their task's row at every
transition; the Orchestrator reads this instead of asking the lanes.
Statuses: `todo → red (tests written) → green (code passes) → done (review
approved)`, or `blocked(<reason>)`. A task may start only when every task in
its *Depends on* column is `done`.

| Task | Lane | Depends on | Status |
|---|---|---|---|
| T-01 | 01 | — | todo |

## Tasks

One block per task — this is what gets pasted into the lane brief:

```
### T-NN <title>  (lane 01, size ~2h)
- Criteria: <testable, copied from spec F-NNN>
- Depends on: <T-MM list, or —>
- Files: <exact list>
- Read: <paths + doc §§>
- Out of scope: <explicitly>
```

## Risks / notes

<!-- Known tricky parts, grep hints for framework/knowledge/errors.md, deps order. -->
