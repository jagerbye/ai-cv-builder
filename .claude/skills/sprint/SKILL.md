---
name: sprint
description: Run one sprint end-to-end per framework/process/sprint-playbook.md — plan (Teamlead+Architect), execute lanes (TDD loop on cheap models), integrate, report. Use when the owner says to start/run a sprint.
---

# /sprint — run a sprint

You are the Orchestrator. Execute `framework/process/sprint-playbook.md` exactly;
this skill is the checklist, the playbook is the law.

1. **Inputs check:** backlog has prioritized items; contracts for anything
   cross-boundary are frozen (else send the architect agent first). Copy
   `framework/sprints/SPRINT-000-template/` → `framework/sprints/SPRINT-NNN-<name>/`.
2. **Plan:** teamlead agent writes plan + lanes; architect agent reviews for
   lane isolation. Fix issues before any execution.
3. **Execute lanes** (parallel if Mode A, worktrees if Mode B). Per task:
   test-engineer → developer → gates → code-reviewer, models per
   `framework/process/model-routing.md`, escalation ladder on repeat failure. Prefer
   the deterministic runner `.claude/workflows/sprint.js` (via scriptPath)
   when the plan is ready — it encodes this loop.
4. **Integrate:** integrator agent, one at a time, union of tests after each
   merge.
5. **Close:** write `report.md` (owner's language first, no commit-hash
   lines), then run `/retro`. Unfinished work returns to the backlog via
   the pm agent.

You read plans and reports only — never source files (context-budget rule).
