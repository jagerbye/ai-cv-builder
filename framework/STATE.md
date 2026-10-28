# STATE.md — the project's "now" (≤40 lines, hard cap)

> **What this file is:** the Orchestrator's externalized working memory —
> the ONLY file (besides CLAUDE.md) a session needs to resume exactly where
> the last one stopped.

## Now

- **Phase:** sprint 01, re-planned into two waves (ADR-011) — executing,
  runner `wf_b5169f19-7bc`. First runner stopped: it ignored T-01's blocking
  fix-list, whose root causes were doc gaps (fixed in 9add869).
- **Current focus:** wave 0 — T-01 fixes, T-02 schema, T-07 route registry.

## In flight

- wave 0 (lane 01): T-01 → T-02 → T-07, blocking
- wave A (lanes 02–06, 15 tasks) starts automatically when the tree is green

## Waiting on

- **Owner:** `ANTHROPIC_API_KEY` in `.env` before sprint 2 (sprint 1 needs no key)
- **Owner (optional):** overrule any A-01…A-06 inference in `assumptions.md`

## Next 3 actions

1. Read the runner's result; `needsAttention` goes back to its lane with a
   corrected brief before integration.
2. Integrator merges six lanes, union of tests after each; commit per task.
3. Wave B (T-20…T-23), QA at both viewports, report, retro — the retro feeds
   B-024/CVB-26: harvest `knowledge/framework-feedback.md` into the template.

## Recent decisions (this week only)

- ADR-002 — groundedness = extract → compose(facts only) → deterministic verify
- ADR-004 — Postgres `SKIP LOCKED` is the queue; no Redis, no broker
- ADR-005 — PDF via `@react-pdf/renderer`, no headless Chrome
- ADR-008 — trimmed ceremony: 3 sprints, QA after sprints 2 and 3, one retro
- ADR-009 — Jira is virtual (`framework/sprints/board.md`, key CVB)
- ADR-010/011 — toolchain belongs in the dependency list; six parallel lanes,
  worktrees unavailable at lane granularity
