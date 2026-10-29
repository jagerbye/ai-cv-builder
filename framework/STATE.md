# STATE.md — the project's "now" (≤40 lines, hard cap)

> **What this file is:** the Orchestrator's externalized working memory —
> the ONLY file (besides CLAUDE.md) a session needs to resume exactly where
> the last one stopped.

## Now

- **Phase:** sprint 01 — waves 0, A and B all complete and integrated.
- **Green:** `bash framework/scripts/gate.sh` ✓ on three consecutive full runs
  (api 534 passed / 5 skipped, web 157 passed). No wave marker in the tree.
- **Current focus:** manual QA, then the sprint close.

## In flight

- One lane fixing the rate-limit suite's leaked queued jobs (E-004's root
  cause; the persist suite is already immune).

## Waiting on

- **Owner:** `ANTHROPIC_API_KEY` in `.env` — the suite needs none, a real
  end-to-end generation does.

## Next 3 actions

1. QA per `framework/process/qa-playbook.md`: real browser, functional +
   visual, 1440×900 and 375×812, screenshots into `qa-report.md`.
2. Sprint report + `framework/sprints/HISTORY.md` + `/retro`.
3. LAST: B-024 / CVB-26 — port `framework/knowledge/framework-feedback.md`
   (FF-01…FF-13) into `~/Desktop/www/ai-dev-framework` in ONE pass.

## Recent decisions (this week only)

- ADR-002/013 — groundedness = extract → compose(facts only) → deterministic
  verify; entries cite their own facts, employer and period must co-occur
- ADR-004 — Postgres `SKIP LOCKED` is the queue; no Redis, no broker
- ADR-009 — Jira is virtual (`framework/sprints/board.md`, key CVB)
- ADR-011 — lanes are disjoint file sets; worktrees unavailable per lane
- ADR-012 — Node 24 LTS, argon2id from the standard library
- ADR-014 — the job-queue suite lock is a helper with a guard test
- ADR-015 — answering a question bumps the CV's version (C-008's token)

## Open, owned by nobody yet

- 5 container tests skipped until the api image is built
  (`tests/contract/auth-session-container.test.ts`)
- Facts are stored but no UI shows them yet (B-022, parked)
