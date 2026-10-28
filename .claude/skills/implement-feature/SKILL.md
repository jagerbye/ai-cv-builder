---
name: implement-feature
description: Implement ONE feature outside the sprint machinery — same quality gates, minimal ceremony. Use for small/urgent single features when a full sprint is overkill.
---

# /implement-feature — the lightweight path

For one small feature or fix. Same gates as a sprint, no sprint folder.

1. **Spec first:** the feature must exist in `framework/docs/spec.md` with testable
   criteria; if not, add a minimal F-NNN section (owner confirms wording).
   Check `framework/docs/decisions.md` for conflicts.
2. **Brief yourself** using the lane-brief template
   (`framework/process/sprint-playbook.md` §2): file list, read list, out-of-scope,
   errors.md grep keywords.
3. **TDD loop:** test-engineer agent (Haiku) → developer agent (Haiku) →
   gates → code-reviewer agent. Escalation ladder applies. For a trivial
   change the Orchestrator may run the loop itself — but tests still come
   first and gates still run.
4. **Docs-sync** rows, then a 3-line note in `framework/sprints/backlog.md` Done
   section so the work is visible to the next session.
