# STATE.md — the project's "now" (≤40 lines, hard cap)

> **What this file is:** the Orchestrator's externalized working memory —
> the ONLY file (besides CLAUDE.md) a session needs to resume exactly where
> the last one stopped.

## Now

- **Phase:** sprint 01 — executing (runner `wf_bf1f7f9a-d14`, started 2026-10-28)
- **Current focus:** lane 01 prologue (T-01 workspace, T-02 compose + schema);
  lanes 02 and 03 start automatically once the tree builds.

## In flight

- T-01, T-02 (lane 01, blocking prologue) — test-engineer → developer → reviewer
- lanes 02 (auth) and 03 (web) queued behind the prologue, then parallel

## Waiting on

- **Owner:** `ANTHROPIC_API_KEY` in `.env` before sprint 2 (sprint 1 needs no key)
- **Owner (optional):** overrule any A-01…A-06 inference in
  `framework/docs/product/assumptions.md` — none blocks sprint 1

## Next 3 actions

1. Read the runner's result; anything in `needsAttention` goes back to its lane
   with a corrected brief before integration.
2. Integrator merges the lanes, union of tests after each merge; then sprint
   report + HISTORY line.
3. Teamlead plans SPRINT-002 (B-007…B-014) — the generation pipeline;
   C-003…C-006 and C-012 are already frozen for it.

## Recent decisions (this week only)

- ADR-002 — groundedness = extract → compose(facts only) → deterministic verify
- ADR-004 — Postgres `SKIP LOCKED` is the queue; no Redis, no broker
- ADR-005 — PDF via `@react-pdf/renderer`, no headless Chrome
- ADR-008 — trimmed ceremony: 3 sprints, QA after sprints 2 and 3, one retro
- ADR-009 — Jira is virtual (`framework/sprints/board.md`, key CVB); the
  Orchestrator commits one commit per finished task, nothing is pushed
