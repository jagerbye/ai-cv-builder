# .claude/workflows/ — the sprint runner

A Workflow script is a deterministic program that calls agents with role
files, briefs and a result schema, so the loop in
`framework/process/sprint-playbook.md` §3 runs mechanically instead of being
re-decided by a model each time.

- `sprint.js` — the template's sprint runner, current as of the end of this
  build. Empty tables (`BASE`, `LANES`, `TASKS`, `CHAINS`) to fill from a
  plan; validates them before `wave.sh start`; per task test-engineer →
  developer → reviewer → fix cycle; blocks routed by `blockedOn` kind; a
  two-rung ladder that returns both reports; `wave.sh end` even when a chain
  throws. Each of those behaviours is a finding in
  `framework/knowledge/framework-feedback.md` (FF-01, FF-10, FF-11, FF-12).

## The 52 one-off runners that drove this build are gone

Each wave, fix pass, QA round and harvest ran from its own script, and all 52
of them hard-coded commit hashes, task ids and file paths from this
repository: a record of how the work was driven, not code anyone can run
again. They were removed so the repository reads as a product rather than as
a session log. What they did survives where it is useful:

- the briefs and decisions, in `framework/sprints/SPRINT-00*/plan.md`;
- the outcomes, in each sprint's `report.md` and in `framework/sprints/HISTORY.md`;
- what each run taught the method, in `framework/knowledge/framework-feedback.md`;
- the task-by-task state, in `framework/sprints/board.md`.

`git log` still has them; nothing here needs them.
