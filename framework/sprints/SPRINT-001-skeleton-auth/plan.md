# Sprint 01 — plan (re-planned 2026-10-28 into two waves, ADR-011)

> **What this file is:** the Teamlead's plan for one sprint: goal, lanes,
> mode per lane, and the task list each lane owns. The task blocks here are
> canonical; `.claude/workflows/sprint.js` carries the expanded, self-contained
> version of each one that an agent actually receives.

- **Goal (owner's language):** the whole product — sign in, feed it a CV or
  free text, get a grounded draft with questions, edit it, download an A4 PDF.
- **Backlog items:** B-001 … B-020 (B-021…023 parked)
- **Contracts frozen:** C-000 … C-013 — all of them, before wave A starts.
  This is what buys the parallelism: six lanes code against contracts, not
  against each other's implementations.
- **Base ref:** moves with the foundation. `check-lane.sh` diffs against the
  commit at the end of lane 01, not against the sprint's first commit —
  orchestrator-level commits (board, ADRs, doc fixes) sit in between and are
  not lane work.
- **Dates:** re-planned 2026-10-28; ~4h15m of workflow wall-clock remaining.

## Why this shape (ADR-011)

The original three sequential sprints spent most of their time waiting. Only
one chain is genuinely sequential — **gateway → extract → compose → verifier**
— and it sets the floor. Everything else is independent once the contracts are
frozen, so it runs beside that chain.

Worktrees are not available at lane granularity: the isolation flag wraps a
single agent, and a lane is three agents that must share one tree. Lane
isolation is therefore bought with **strictly disjoint file areas**, and the
two files that would otherwise be shared — `api/src/server.ts` and the
cross-lane TypeScript interfaces — are created up front by T-07 so that no
lane ever edits a file another lane owns.

## Lanes

### Wave 0 — foundation (blocking, lane 01)

| Lane | Mode | Files area | Tasks |
|---|---|---|---|
| 01 | A | root configs, `api/prisma/**`, `api/src/db/**`, `api/src/env.ts`, `api/src/server.ts`, `api/src/routes/*.ts` (empty plugins), `api/src/core/*/types.ts`, `docker-compose.yml`, Dockerfiles | T-01, T-02, T-07 |

### Wave A — six lanes in parallel

| Lane | Mode | Files area | Tasks |
|---|---|---|---|
| 02 | A | `api/src/core/auth/**`, `api/src/routes/auth.ts`, `api/src/http/**` | T-03, T-04 |
| 03 | A | `web/**` | T-05, then T-06 / T-13 / T-14 fanned out |
| 04 | A | `api/src/llm/**`, `api/src/core/generation/{gateway,extract,compose}*`, `prompts/**`, `tests/fixtures/llm/**` | T-09, T-10, T-11 |
| 05 | A | `api/src/core/intake/**`, `api/src/core/jobs/**`, `api/src/routes/cvs-create.ts`, `api/src/routes/jobs.ts` | T-15, T-16 |
| 06 | A | `api/src/core/cv/**`, `api/src/core/export/**`, `api/src/routes/cvs.ts`, `api/src/routes/export.ts` | T-17, T-18, T-19 |
| 07 | A | `api/src/core/generation/{verify,questions}*`, `tests/fixtures/golden/**` | T-12 |

Lane 04 is the critical chain and sets the wave's wall-clock. The verifier
(T-12) was pulled out of it into lane 07 on the second re-plan: `verify()` is a
pure function over the types T-07 freezes, so it never needed the gateway,
extract or compose implementations — it only looked sequential because it is
conceptually last. Lane 03 fans out the same way: its three screens depend on
the shell, not on each other, and T-05 pre-creates their route modules so none
of them touches the router. Lane 05's job
runner calls lane 04's pipeline **through the C-012 interface from T-07** — it
never imports lane 04's implementation, which is why the two can run at once.

### Wave B — after wave A is integrated

| Lane | Mode | Files area | Tasks |
|---|---|---|---|
| 07 | A | `api/src/core/cv/answer*`, `api/src/routes/cvs.ts` | T-20 |
| 08 | A | `api/src/http/**`, `api/src/routes/**` (cross-cutting only) | T-21 |
| 09 | A | `web/src/features/cv/**` | T-22 |
| 10 | A | `README.md` | T-23 |

## Status board

Statuses: `todo → red → green → done`, or `blocked(<reason>)`.

| Task | Lane | Wave | Depends on | Issue | Status |
|---|---|---|---|---|---|
| T-01 | 01 | 0 | — | CVB-1 | round 5 review: fix-list (not approved). Lint, build, web tests green; gate red only on T-02 files; check-lane allowlist gap; Teamlead scoping pending |
| T-02 | 01 | 0 | T-01 | CVB-2 | green: round 3 fix-list cleared (CI postgres service, gate starts db, DATABASE_URL validation test); gate all green from stopped docker (api 69 + web 14). Awaiting re-review; allowlist needs main.ts, database-schema.md, errors.md |
| T-07 | 01 | 0 | T-02 | CVB-24 | green: lane 17/17, core type tests 13/13, gate ✓ all green; review fix applied (register-call asserts); awaiting re-review |
| T-03 | 02 | A | T-07 | CVB-3 | blocked(item 4 done, argon2 test now verifies hash; items 1-3 need Teamlead/Orchestrator edits outside allowlist: argon2 on Node 22 + ADR, vitest include, root envelope install in server.ts) |
| T-04 | 02 | A | T-03 | CVB-4 | blocked(code green 36/36 with contract; open items need Teamlead edits outside allowlist: vitest include, Dockerfile Node 24 or argon2 dep, server.ts envelope) |
| T-05 | 03 | A | T-07 | CVB-5 | blocked(typecheck: routes.test.tsx:70 test-file error, code otherwise green) |
| T-06 | 03 | A | T-05 | CVB-6 | todo |
| T-13 | 03 | A | T-05 | CVB-13 | todo |
| T-14 | 03 | A | T-05 | CVB-14 | todo |
| T-09 | 04 | A | T-07 | CVB-9 | green: gateway 23/23, config 4/4, seam 1/1, gate lint ✓; gate red only on other tasks (T-12 verify/questions, intake, web styles, web build); review fixes 1-4 landed, own suites 34/34; gate red only on other lanes (web routes TS18048, stack-config, verify.golden); awaiting re-review; nothing committed |
| T-10 | 04 | A | T-09 | CVB-10 | green: extract 18/18; review fix-list item 1 fixed (markers neutralised), re-review pending; nothing committed |
| T-11 | 04 | A | T-10 | CVB-11 | review fix-list 1-4 done: compose.ts + prompts/compose.ts, lane 14/14; gate red outside lane; nothing committed |
| T-12 | 07 | A | T-07 | CVB-12 | blocked(architect): verifier built, lane 55/57; 2 golden reds on prompt-injection = entry-citation model undefined (CvDraft entries and education carry no factIds); needs ADR + reviewer sign-off on fixture, not a code fix |
| T-15 | 05 | A | T-07 | CVB-7 | blocked(C-004 multipart: no parser in the dependency budget, Teamlead decision; contract 9/20 green, 11 red on 415; unit 17/17 green; reviewer ok=false) |
| T-16 | 05 | A | T-15 | CVB-8 | green: jobs 24/24 (stable over 8 runs), contract jobs 8/8 via scratch config, gate red only on other lanes (typecheck web routes.test, lint compose.test/cvs.ts, stack-config, verify.golden); check-lane no T-16 violation; not committed |
| T-17 | 06 | A | T-07 | CVB-15 | green on real session (requireUser wired by T-18 fix; contract cvs-read 8/8); lane command misses tests/contract (include gap) |
| T-18 | 06 | A | T-17 | CVB-16 | green after fix-list: reorder returned in stored order (asserted by position after PATCH and GET), vitest include now covers tests/contract; cvs-patch 9/9, cvs-read 8/8, core/cv 18/18. Open: regenerate path must call mergeRegenerated (lane 05, T-20) |
| T-19 | 06 | A | T-17 | CVB-18 | todo |
| T-20 | 07 | B | T-12, T-17 | CVB-17 | todo |
| T-21 | 08 | B | wave A | CVB-19 | todo |
| T-22 | 09 | B | T-17, T-14 | CVB-15 | todo |
| T-23 | 10 | B | wave A | CVB-20 | todo |

## Tasks

### T-01 Repo scaffold and the gate  (lane 01) — REOPENED
- Criteria: the original B-001 criteria, plus the reviewer's blocking
  fix-list: api runtime dependencies are declared and in the lockfile, the
  stray root `tsconfig.json` is resolved, `@types/node` is pinned to 22.x, and
  the four toolchain entries added to architecture.md §1 by ADR-010 are
  installed (ESLint + typescript-eslint, happy-dom, @vitejs/plugin-react).
  `lint` becomes a real linter and the web `build` produces a bundle.
- Files: root configs, `api/package.json`, `web/package.json`, lockfile.

### T-02 Compose stack and the full schema  (lane 01)
- Criteria: B-002; the schema covers **seven** tables per database-schema.md
  (six entities plus `sessions`), every listed index including the FK indexes
  added on 2026-10-28 and the two partial ones as raw SQL. Health per C-013.
- Files: `docker-compose.yml`, Dockerfiles, `.env.example`, `api/prisma/**`,
  `api/src/db/**`, `api/src/env.ts`, `api/src/server.ts`, `api/src/routes/health.ts`.

### T-07 Route registry and cross-lane interfaces  (lane 01)
- Criteria: `api/src/server.ts` registers five route plugins —
  `auth.ts`, `cvs-create.ts`, `jobs.ts`, `cvs.ts`, `export.ts` — each of which
  exists as an **empty, registered, typechecking** Fastify plugin owned later
  by exactly one lane. The C-012 pipeline interface and the C-006 CV DTO types
  exist as declaration-only modules with no implementation. The gate is green
  on the empty plugins. This task exists so that no wave-A lane edits a file
  another lane owns.
- Files: `api/src/server.ts`, `api/src/routes/*.ts`,
  `api/src/core/generation/types.ts`, `api/src/core/cv/types.ts`.

### T-03 / T-04 — auth (lane 02)
Unchanged from the original plan: registration; then login, session cookie,
`requireUser`, `assertOwnership`. Criteria in spec.md F-001 and contracts
C-001, C-002.

### T-05 / T-06 / T-13 / T-14 — web (lane 03)
Shell and API client; auth screens; intake form (F-002); progress view with
reload-safe resume (F-003). Criteria in spec.md §3.1, §3.2, §3.3, §3.9.

### T-09 / T-10 / T-11 / T-12 — generation (lane 04, critical chain)
Anthropic gateway (C-012, F-010); extract stage with verbatim quotes; compose
stage from facts only; deterministic verifier plus questions and the five
adversarial golden fixtures. Criteria in spec.md §3.4, §3.5 and ADR-002/006.

### T-15 / T-16 — intake and jobs (lane 05)
PDF and free-text intake with every rejection case (C-003, C-004); durable job
table, lease loop, reclaim, timeout, status endpoint (C-005, ADR-003/004).

### T-17 / T-18 / T-19 — CV API and export (lane 06)
Read/list/delete (C-006, C-007); PATCH with optimistic concurrency and
`userEdited` protection (C-008); A4 PDF with a real text layer (C-011, ADR-005).

### Wave B
T-20 answer → user fact → section-scoped recompose (C-009); T-21 hardening —
rate limits, error envelope everywhere, LLM degradation (F-010); T-22 editor UI
with inline questions (F-006); T-23 README (B-020).

## Risks / notes

- **E-001 applies**: lanes use their own scoped test command, never root `npm test`.
- Six lanes against a 9-agent concurrency cap means wave A runs ~6 agents at
  once with headroom; it is not oversubscribed.
- A designer pass is rewriting `framework/docs/design/design.json`, which held
  the framework template's dashboard example — a confidently wrong token set is
  worse than an empty one, and lane 03 is briefed to stop if it still sees it.
- Lane 07's verifier (T-12) is the likeliest escalation in the project. It is
  deterministic code with adversarial fixtures — if Haiku fails it twice, let
  it go to Sonnet rather than re-briefing a third time.
- Lane 05 must not import from `api/src/core/generation/` except `types.ts`.
  The reviewer checks this explicitly; it is the seam the whole wave rests on.
