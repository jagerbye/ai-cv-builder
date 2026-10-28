---
name: qa
description: Run a manual QA pass (functional + visual, desktop & mobile) against the running site via a browser-driving agent, per framework/process/qa-playbook.md. Use at sprint stage 4.5 or on demand ("проверь сайт/стейдж", "QA pass").
---

# /qa — manual QA pass

You are the Orchestrator.

1. **Target:** resolve the URL — argument, or the env table in
   `framework/docs/runbooks/deploy.md`; for local, start the app per the local
   runbook and verify it answers before spawning QA. For a staging pass
   after a push: first ASK the owner to confirm staging is deployed and
   checkable (one question for the whole batch —
   `framework/process/task-lifecycle.md`).
2. **Scope:** what changed (sprint plan / recent reports) + a smoke of core
   flows. Name the exact pages/flows — "the whole site" is only valid for a
   first-ever pass.
3. **Report file:** the current sprint's `qa-report.md`, or
   `framework/sprints/qa-adhoc-YYYY-MM-DD.md` outside a sprint (template:
   `framework/sprints/SPRINT-000-template/qa-report.md`).
4. **Spawn the qa-engineer agent** with target, scope, report path. Browser
   tools missing → tell the owner what to install (Playwright MCP plugin or
   claude-in-chrome) instead of faking a pass.
5. **Triage the report:** blockers → owning lane / sprint machinery (a
   sprint cannot close over an open blocker); everything else → `/hotfix`.
6. **Jira close-out (when configured):** per passed task — comment
   «staging OK» with evidence and move the status forward automatically;
   tasks labeled **critical** — only after the owner's explicit yes
   (`framework/process/task-lifecycle.md`).
7. Tell the owner: coverage, counts by severity, worst finding, what was
   sent to hotfix, which statuses moved.
