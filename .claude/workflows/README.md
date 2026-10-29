# .claude/workflows/ — the runners that drove this build

Every file here is a Workflow script: a deterministic program that calls
agents with role files, briefs and a result schema, so the loop in
`framework/process/sprint-playbook.md` §3 runs mechanically instead of being
re-decided by a model each time. One of them is the reusable runner; the rest
are the actual runs, kept as the record of how the work was really driven.

## The reusable runner

- `sprint.js` — the template's sprint runner, current as of the end of the
  build. Empty tables (`BASE`, `LANES`, `TASKS`, `CHAINS`) to fill from a
  plan; validates them before `wave.sh start`; per task test-engineer →
  developer → reviewer → fix cycle; blocks routed by `blockedOn` kind; a
  two-rung ladder that returns both reports; `wave.sh end` even when a chain
  throws. Each of those behaviours is a finding in
  `framework/knowledge/framework-feedback.md` (FF-01, FF-10, FF-11, FF-12).

## The record — in the order they ran

Read these as evidence, not as code to reuse: the briefs are the real briefs,
the decisions in them are the real decisions, and the shape of each script
shows what the previous one left open.

| Script | What it was |
|---|---|
| `wave-a.js` | SPRINT-001 wave A: seven disjoint lanes against frozen contracts C-000..C-013, with the web lane fanning out into three screens. This is the file the sprint plan calls `sprint.js`; it was renamed when the reusable runner took that name. It is the version FF-01 and FF-11 were found in. |
| `finish-t12.js`, `finish-wave-a.js` | The tasks wave A left open: the verifier once ADR-013 was decided, three allowlist-only re-reviews, the Node 24 rebuild. |
| `wave-b.js`, `finish-wave-b.js`, `wave-b-close.js`, `wave-b-flake.js`, `integrate-wave-b.js` | Wave B (answer / regenerate, hardening, the editor), the four `blockedOn: decision` stops it ended on and their resolutions, the persist flake, and the union run. |
| `t28-fix.js`, `lane-f-fix.js`, `ratelimit-leak.js`, `leak-guard.js` | Review fix-lists and test-suite leaks found at integration. |
| `qa-wave-b.js`, `qa-fix.js`, `qa-fix-2.js`, `close-qa.js`, `qa-recheck.js`, `hotfix-qa.js`, `hotfix-qa15.js`, `qa-final.js` | Stage 4.5: the manual QA pass that found the missing web→api route (FF-15), the fix lanes, re-checks and hotfixes down to the close verdict. |
| `close-sprint-fixes.js`, `close-sprint.js`, `final-three.js`, `tail-fixes.js` | The last review items, the suite's own database (ADR-019), the report, HISTORY entry and retro. |
| `budget.js`, `budget-fix.js`, `base-url.js`, `readme-truth.js` | Post-close: spend bounds on every model-calling path, the configurable endpoint, the README made true. |
| `b024-harvest.js`, `b024-pass2.js`, `b024-pass3.js` | B-024: porting the findings back into the template, and the two passes the harvest's own reviewer sent it back for. |
| `sync-method.js` | The run that brought the method vendored here back in line with the template those passes produced. |

Scripts other than `sprint.js` hard-code commit hashes, task ids and file
paths from this repository; they are not meant to run again.
