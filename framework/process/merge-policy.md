# merge-policy.md — parallel work without merge hell

> **What this file is:** how multiple teams work at the same time: the two
> parallelism modes, branch layout, and the Integrator's procedure.

## Mode A — disjoint lanes (default, cheap)

For tasks that touch **non-overlapping file sets**.

- One sprint branch; each lane works directly on it in its own file area, or
  on short-lived `lane/NN-<name>` branches.
- The Teamlead's plan IS the isolation mechanism: file lists per lane are
  disjoint and enforced by the lane brief ("files you may touch").
- Integration = fast-forward-ish merges + union test run. Conflicts here
  mean the plan was violated — log it in the retro.

## Mode B — overlapping work (sequential lanes + Integrator)

For tasks that **must** touch the same areas (e.g. a refactor + a feature).

- **Worktrees isolate an agent, not a lane.** The runner's worktree isolation
  wraps a single agent call, while a lane is three agents (test-engineer →
  developer → reviewer) that must share one tree — in per-agent worktrees the
  developer never sees the tests written for it. So "a worktree per team" is
  not something the runner can give you, and this mode does not ask for it.
- What Mode B therefore is: the overlapping lanes run **one after the other**
  on the sprint branch, each on its own short-lived `lane/NN-<name>` branch,
  and the second starts from the first's merged result. Parallelism is bought
  elsewhere — by the bootstrap task's first half, the shared files shipped
  empty (sprint-playbook §1), which usually turns a Mode-B pair back into
  Mode A.
- Both lanes code against the **frozen contracts** (api-contracts.md); the
  contract, not the code, is the coordination point.
- The **Integrator (Fable 5)** merges: smaller/riskier branch first, union
  of tests after each merge, resolves conflicts by intent (reading both lane
  reports), never by discarding one side's tests.
- If intent is ambiguous, Integrator stops and asks the Orchestrator —
  a guessed merge is worse than a late one.
- A true per-lane worktree becomes available only when the orchestrator or
  runner creates and tears down a worktree *around* a whole lane. Until a
  runner does that, do not plan a sprint that depends on it.

## Rules for both modes

1. **main is always green.** Nothing reaches main with red gates.
2. **Merge order:** migrations/schema → contracts/shared types → features.
3. **Tests are additive across lanes:** the union must pass; a lane may not
   modify another lane's tests (reviewer checks).
4. **One Integrator per sprint.** Parallel merging by multiple agents is
   forbidden — serialization is the point.
5. Lane branches are kept until the sprint report is written, then deleted.
6. **Commit by pathspec, never `git add -A`, while a wave is in flight.** The
   tree then holds other lanes' finished, uncommitted work by design, so the
   first command every agent reaches for is the one that sweeps it into a
   commit about something else. Files one task cannot separate (a wiring
   file several tasks edit) are committed together, with the reason in the
   message, rather than split into commits that do not build.
