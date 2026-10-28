# STATE.md — the project's "now" (≤40 lines, hard cap)

> **What this file is:** the Orchestrator's externalized working memory —
> the ONLY file (besides CLAUDE.md) a session needs to resume exactly where
> the last one stopped.

## Now

- **Phase:** sprint 01 — planned, not started (no code exists yet)
- **Current focus:** docs are complete through ADR-008; next action is to run
  SPRINT-001's three lanes.

## In flight

- nothing running

## Waiting on

- **Owner:** `ANTHROPIC_API_KEY` in `.env` before sprint 2 (sprint 1 needs no key)
- **Owner (optional):** overrule any A-01…A-06 inference in
  `framework/docs/product/assumptions.md` — none blocks sprint 1

## Next 3 actions

1. Run SPRINT-001 lanes 01–03 via `.claude/workflows/sprint.js` (fill `LANES`
   from `framework/sprints/SPRINT-001-skeleton-auth/plan.md` §Tasks, run by
   **scriptPath**, not by name).
2. Integrator merges the three lanes, union of tests after each merge.
3. Teamlead plans SPRINT-002 (B-007…B-014) — the generation pipeline; freeze
   C-003…C-006, C-012 before it starts.

## Recent decisions (this week only)

- ADR-002 — groundedness = extract → compose(facts only) → deterministic verify
- ADR-004 — Postgres `SKIP LOCKED` is the queue; no Redis, no broker
- ADR-005 — PDF via `@react-pdf/renderer`, no headless Chrome
- ADR-008 — trimmed ceremony: 3 sprints, QA after sprints 2 and 3, one retro
- Discovery skipped on purpose; product docs other than assumptions.md stay stubs
