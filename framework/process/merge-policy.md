# merge-policy.md — parallel work without merge hell

> **What this file is:** how multiple teams work at the same time: the two
> parallelism modes, branch/worktree layout, and the Integrator's procedure.

## Mode A — disjoint lanes (default, cheap)

For tasks that touch **non-overlapping file sets**.

- One sprint branch; each lane works directly on it in its own file area, or
  on short-lived `lane/NN-<name>` branches.
- The Teamlead's plan IS the isolation mechanism: file lists per lane are
  disjoint and enforced by the lane brief ("files you may touch").
- Integration = fast-forward-ish merges + union test run. Conflicts here
  mean the plan was violated — log it in the retro.

## Mode B — overlapping work (worktrees + Integrator)

For tasks that **must** touch the same areas (e.g. a refactor + a feature).

- Each team gets its own **git worktree** on its own branch
  (`team-A/<task>`, `team-B/<task>`) — full checkout, zero interference.
- Both teams code against the **frozen contracts** (api-contracts.md); the
  contract, not the code, is the coordination point.
- The **Integrator (Fable 5)** merges: smaller/riskier branch first, union
  of tests after each merge, resolves conflicts by intent (reading both lane
  reports), never by discarding one side's tests.
- If intent is ambiguous, Integrator stops and asks the Orchestrator —
  a guessed merge is worse than a late one.

## Rules for both modes

1. **main is always green.** Nothing reaches main with red gates.
2. **Merge order:** migrations/schema → contracts/shared types → features.
3. **Tests are additive across lanes:** the union must pass; a lane may not
   modify another lane's tests (reviewer checks).
4. **One Integrator per sprint.** Parallel merging by multiple agents is
   forbidden — serialization is the point.
5. Worktrees are cleaned after merge; branches are kept until the sprint
   report is written.
