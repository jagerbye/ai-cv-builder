# STATE.md — the project's "now" (≤40 lines, hard cap)

> **What this file is:** the Orchestrator's externalized working memory —
> the ONLY file (besides CLAUDE.md) a session needs to resume exactly where
> the last one stopped.

## Now

- **Phase:** sprint 01 closed. Waves 0, A and B built, integrated and QA'd;
  all 15 QA findings fixed; B-024 harvested back into the template.
- **Green:** `bash framework/scripts/gate.sh` ✓ on 10 of 10 consecutive serial
  runs — api 591 passed / 5 skipped, web 220, smoke 11. One gate run at a time
  per database (E-008).
- **Nothing is in flight.** The next session starts from the backlog.

## Waiting on

- **Owner:** `ANTHROPIC_API_KEY` in `.env`. The suite needs none and never
  will — every Anthropic call goes through the C-012 seam, mocked everywhere.
  A real generation has therefore never run; that is the one unproven claim
  in the README and it is written there as such.

## Next 3 actions

1. With a key: run one real generation end to end and record what the live
   model does to the golden fixtures' assumptions.
2. B-021…B-023 if the owner wants them (SSE progress, source-quote popover,
   session sweep) — all parked with reasons on the board.
3. The two notes B-024 left for the next project: a test-engineer failure
   with `blockedOn: code` has no rung on the escalation ladder, and a blocked
   task appears in both `blocked` and `needsAttention`.

## Recent decisions (this week only)

- ADR-002/013/016 — groundedness: extract → compose(facts only) → deterministic
  verify; entries cite their own facts; a question's path names a FIELD
- ADR-011 — lanes are disjoint file sets; worktrees unavailable per lane
- ADR-014/019 — the job-queue lock is a helper with a guard; the suite has its
  own database, because four incidents had one cause
- ADR-015/017/018/020 — version bumps on an answer; a failed CV carries
  lastError; the two provider failures keep their own codes, on both paths

## Known, owned by nobody

- 5 container tests skipped until the api image is built
- Facts are stored and served but no UI shows them (B-022, parked)
