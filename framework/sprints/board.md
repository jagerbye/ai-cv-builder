# board.md — the virtual Jira

> **What this file is:** this project's issue tracker. There is no Atlassian
> instance: the owner asked for Jira to be imagined, so the mirror lives here
> as a file (ADR-009). Everything `framework/process/task-lifecycle.md` says
> about "the Jira mirror" applies to this table — including the rule that the
> mirror may never be ahead of local reality.
> **Who writes it:** PM (issues, order), Orchestrator (status transitions,
> worklogs at task close). **Who reads it:** the owner, session start.

- **Project key:** `CVB` · **Board:** SPRINT-001 (re-planned into two waves, ADR-011)
- **Assignee for everything:** the owner (single-person project)
- **Worklog unit:** the `time:` line from the lane report, per role
- **Statuses:** `To Do → In Progress → In Review → Ready for test → Done`.
  There is no staging in this project (architecture.md §5), so
  `Ready for test` means "merged into main and covered by the gate", and QA
  happens locally against `docker compose up`.

## Sprint 001 — wave 0 (foundation, blocking)

| Issue | Task | Lane | Summary | Status | Est |
|---|---|---|---|---|---|
| CVB-1 | T-01 | 01 | Scaffold, workspaces, real lint and bundler | In Progress (reopened by review) | 2h |
| CVB-2 | T-02 | 01 | Compose stack, seven-table schema, health | In Progress | 2h |
| CVB-24 | T-07 | 01 | Route registry and cross-lane interfaces | To Do | 1h |

## Sprint 001 — wave A (six lanes in parallel)

| Issue | Task | Lane | Summary | Status | Est |
|---|---|---|---|---|---|
| CVB-3 | T-03 | 02 | Registration, argon2id, error envelope | To Do | 2h |
| CVB-4 | T-04 | 02 | Login, session cookie, ownership guard | To Do | 2h |
| CVB-5 | T-05 | 03 | Web shell, API client, mobile layout | To Do | 2h |
| CVB-6 | T-06 | 03 | Auth screens, session restore | To Do | 2h |
| CVB-13 | T-13 | 03 | Intake screen | To Do | 2h |
| CVB-14 | T-14 | 03 | Progress view, reload-safe | To Do | 2h |
| CVB-9 | T-09 | 04 | Anthropic gateway, schema validation, retries | To Do | 2h |
| CVB-10 | T-10 | 04 | Extract stage, verbatim quotes | To Do | 2h |
| CVB-11 | T-11 | 04 | Compose stage, facts only | To Do | 2h |
| CVB-12 | T-12 | 07 | Verifier, questions, golden fixtures | To Do | 3h |
| CVB-7 | T-15 | 05 | Intake: PDF and free text, all rejections | To Do | 3h |
| CVB-8 | T-16 | 05 | Durable jobs, lease, reclaim, timeout | To Do | 3h |
| CVB-15 | T-17 | 06 | CV read, list, delete | To Do | 2h |
| CVB-16 | T-18 | 06 | PATCH, optimistic concurrency, userEdited | To Do | 2h |
| CVB-18 | T-19 | 06 | PDF export, A4, real text layer | To Do | 3h |

| CVB-25 | T-24 | — | Design tokens and spec for this product | Done | 1h / 0:05 |

**Lane 04 is the critical chain** — CVB-9 → 10 → 11. CVB-12 was moved out to
lane 07: the verifier is a pure function over frozen types and never needed the
LLM stages. CVB-25 ran outside the lanes entirely (designer, Fable) and is done.

**Unscheduled scope found by CVB-25:** the design needs ~18 hand-written
inline SVG icons, question-column alignment via offsetTop + ResizeObserver,
and a `prefers-reduced-motion` block. None of it is in any wave-A task's
acceptance criteria, so it will either inflate the web tasks or be cut. The
Orchestrator decides at integration; it is recorded here so it cannot be
absorbed silently.

## Sprint 001 — wave B (after wave A is integrated)

| Issue | Task | Lane | Summary | Status | Est |
|---|---|---|---|---|---|
| CVB-17 | T-20 | 07 | Answer → user fact → section recompose | To Do | 3h |
| CVB-19 | T-21 | 08 | Rate limits, error contract, LLM degradation | To Do | 2h |
| CVB-15b | T-22 | 09 | Editor UI with inline questions | To Do | 3h |
| CVB-20 | T-23 | 10 | README and clean-clone verification | To Do | 2h |

**Labeled `critical`** (need the owner's explicit yes before their final
transition): CVB-2 (migrations), CVB-3, CVB-4 (auth and authorization),
CVB-12 (the groundedness guarantee).

## Parked

| Issue | Backlog | Summary | Why parked |
|---|---|---|---|
| CVB-21 | B-021 | SSE progress instead of polling | ADR-003 keeps polling as the source of truth |
| CVB-22 | B-022 | Source-quote popover per line | data already exposed by C-006; UI only |
| CVB-23 | B-023 | Session expiry sweep | irrelevant without a deployment |

## Done

<!-- Issue | Task | Merged | Logged — newest first -->
