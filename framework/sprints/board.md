# board.md — the virtual Jira

> **What this file is:** this project's issue tracker. There is no Atlassian
> instance: the owner asked for Jira to be imagined, so the mirror lives here
> as a file (ADR-009). Everything `framework/process/task-lifecycle.md` says
> about "the Jira mirror" applies to this table — including the rule that the
> mirror may never be ahead of local reality.
> **Who writes it:** PM (issues, order), Orchestrator (status transitions,
> worklogs at task close). **Who reads it:** the owner, session start.

- **Project key:** `CVB` · **Board:** SPRINT-001-skeleton-auth
- **Assignee for everything:** the owner (single-person project)
- **Worklog unit:** the `time:` line from the lane report, per role
- **Statuses:** `To Do → In Progress → In Review → Ready for test → Done`.
  There is no staging in this project (architecture.md §5), so
  `Ready for test` means "merged into main and covered by the gate", and QA
  happens locally against `docker compose up`.

## Sprint 001

| Issue | Backlog | Task | Summary | Status | Est | Logged |
|---|---|---|---|---|---|---|
| CVB-1 | B-001 | T-01 | Repo scaffold, workspaces and the gate | In Progress | 2h | — |
| CVB-2 | B-002 | T-02 | Compose stack, Prisma schema, health | To Do | 2h | — |
| CVB-3 | B-003 | T-03 | Registration, argon2id, error envelope | To Do | 2h | — |
| CVB-4 | B-004 | T-04 | Login, session cookie, ownership guard | To Do | 2h | — |
| CVB-5 | B-005 | T-05 | Web shell, API client, mobile layout | To Do | 2h | — |
| CVB-6 | B-006 | T-06 | Auth screens, session restore | To Do | 2h | — |

## Backlog (not yet in a sprint)

| Issue | Backlog | Summary | Sprint | Est |
|---|---|---|---|---|
| CVB-7 | B-007 | Intake: PDF and free text, all rejections | 002 | 3h |
| CVB-8 | B-008 | Job table, lease loop, status, reclaim | 002 | 3h |
| CVB-9 | B-009 | Anthropic gateway, schema validation, retries | 002 | 2h |
| CVB-10 | B-010 | Extract stage: facts with verbatim quotes | 002 | 2h |
| CVB-11 | B-011 | Compose stage: facts → draft with citations | 002 | 2h |
| CVB-12 | B-012 | Verifier, questions, adversarial fixtures | 002 | 3h |
| CVB-13 | B-013 | Intake UI | 002 | 2h |
| CVB-14 | B-014 | Progress UI, reload-safe resume | 002 | 2h |
| CVB-15 | B-015 | CV read/list/delete + editor UI | 003 | 3h |
| CVB-16 | B-016 | PATCH, optimistic concurrency, userEdited | 003 | 2h |
| CVB-17 | B-017 | Answer → user fact → section recompose | 003 | 3h |
| CVB-18 | B-018 | PDF export, A4, text layer | 003 | 3h |
| CVB-19 | B-019 | Rate limits, error contract, LLM degradation | 003 | 2h |
| CVB-20 | B-020 | README and clean-clone verification | 003 | 2h |

**Labeled `critical`** (Teamlead, per task-lifecycle.md — these need the
owner's explicit yes before their final transition): CVB-2 (migrations),
CVB-3, CVB-4 (auth and authorization), CVB-12 (the groundedness guarantee).

## Parked

| Issue | Backlog | Summary | Why parked |
|---|---|---|---|
| CVB-21 | B-021 | SSE progress instead of polling | ADR-003 keeps polling as the source of truth |
| CVB-22 | B-022 | Source-quote popover per line | data already exposed by C-006; UI only |
| CVB-23 | B-023 | Session expiry sweep | irrelevant without a deployment |

## Done

<!-- Issue | Task | Merged | Logged — newest first -->
