# framework/ — the method this product was built with

This is a product repository (`api/`, `web/`, `tests/`) that also carries the
development method it was built with. The method is vendored here on purpose:
the sprint that produced the code produced this record at the same time, and
the two only make sense read together. The reusable, project-free version of
the method lives in a separate template repository; this copy is the template
as of the end of the build, plus everything this project filled in.

## The loop, in five lines

1. Discovery → `docs/spec.md`, `docs/architecture.md`, frozen contracts, ADRs (`docs/decisions.md`).
2. Teamlead + Architect plan a sprint into disjoint lanes of ≤2 h tasks (`sprints/<sprint>/plan.md`).
3. Per task, on cheap models: test-engineer writes RED tests → developer goes GREEN → reviewer runs the gate, the lane-isolation check and the mutation, and rejects with a structured fix-list.
4. One Integrator merges lane by lane, running the full union + smoke after each; then manual QA in a real browser (`sprints/<sprint>/qa-report.md`).
5. Retro harvests what went wrong into `knowledge/errors.md`, what worked into `knowledge/patterns.md`, and what the method itself got wrong into `knowledge/framework-feedback.md`.

## What is where

| Path | What it is | Written by |
|---|---|---|
| `process/` | The playbooks: how a sprint, a design pass, a QA pass, a merge, an escalation is run | the method |
| `scripts/` | The enforcement (below) | the method; `gate.config.sh` by this project |
| `../.claude/agents/`, `rules/`, `skills/` | Role files, always-on rules, slash commands | the method |
| `../.claude/workflows/` | The deterministic runners that actually drove the work (see its README) | this build |
| `docs/` | Spec, architecture, API contracts, data model, 21 ADRs, design tokens, runbooks | this project |
| `sprints/` | Plan, per-lane logs, board, integration and QA reports, HISTORY | this project, as it happened |
| `knowledge/` | errors / patterns / framework-feedback — the project's memory | this project |
| `STATE.md` | The externalized "now" a fresh session reads first | this project |

## Where the enforcement lives (not in prose)

- `scripts/gate.sh` — the one definition of green. The Stop hook, CI, the reviewer and the Integrator all run this script and nothing else. Steps come from `scripts/gate.config.sh`: database up + migrated, typecheck, lint, test, build, and a smoke suite (`tests/smoke/`) that reaches the API through the browser's origin over real HTTP.
- `scripts/wave.sh start|status|end` — while parallel lanes share one tree the union is red by design, so a wave marker makes the gate lane-scoped (lint + that lane's own tests, `GATE_LANE_TEST`); `end` removes it and forces the full gate. The runner brackets every wave with it.
- `scripts/check-lane.sh <base> '<glob>'...` — a lane's changed *and untracked* files must match its allowlist; a violation fails the lane before merge.
- `../.claude/settings.json` hooks — `hook-postedit.sh` (fast per-file check after every edit), `hook-stop.sh` (a turn cannot end on a red gate), `hook-pretool.sh` (during a wave, `git add -A` / `commit -a` are refused so one task's commit cannot sweep other lanes' work).
- `../.github/workflows/ci.yml` — runs the same `gate.sh`, always in full mode.

## Read these four first

1. `../CLAUDE.md` — the router every session loads: who the agent is, what to read for which task, the enforcement list.
2. `process/sprint-playbook.md` — the loop above in full: planning rules, the lane-brief template, the TDD/review/fix cycle, integration, QA, retro.
3. `sprints/SPRINT-001-skeleton-auth/plan.md` and one lane log under `lanes/` — the method applied, with the status board and the agents' own reports, fix-lists and blocks.
4. `knowledge/framework-feedback.md` — the fifteen places where the method failed this project and what changed in it as a result; every entry names the file in this directory that now carries the fix.

The Russian-language `cycle-uml.md` is the same loop as a diagram, for the owner.

## Where the work was decomposed

`sprints/backlog.md` is what the brief was cut into; `sprints/board.md` is the
issue tracker with every task's lane, estimate and status — this project has no
Atlassian instance, so the tracker is a file (ADR-009) and the Orchestrator
moves the statuses. `sprints/SPRINT-001-skeleton-auth/plan.md` is the plan the
parallel lanes were built from: task, lane, what it depends on, and the status
row each agent flips as it goes. `sprints/HISTORY.md` is the sprint log.
