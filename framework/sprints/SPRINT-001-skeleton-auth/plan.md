# Sprint 01 — plan

> **What this file is:** the Teamlead's plan for one sprint: goal, lanes,
> mode per lane, and the task list each lane owns.

- **Goal (owner's language):** a user can sign up, log in and come back to an
  empty "My CVs" page — and the whole thing starts with `docker compose up`.
- **Backlog items:** B-001 … B-006
- **Contracts frozen:** C-000, C-001, C-002
- **Base ref:** `main` @ initial commit (empty tree + framework)
- **Dates:** start → target: one sprint run (~90 min of workflow wall-clock)

## Lanes

| Lane | Team/agent set | Mode (A disjoint / B worktree) | Files area | Tasks |
|---|---|---|---|---|
| 01 | tests+dev+review | A | `package.json`, `tsconfig*`, `.eslintrc*`, `docker-compose.yml`, `api/prisma/**`, `api/src/db/**`, `.github/**`, `framework/scripts/gate.config.sh` | T-01, T-02 |
| 02 | tests+dev+review | A | `api/src/core/auth/**`, `api/src/routes/auth.ts`, `api/src/http/**`, `tests/contract/auth*` | T-03, T-04 |
| 03 | tests+dev+review | A | `web/**` | T-05, T-06 |

Lane 02 and lane 03 both depend on C-001/C-002, which are **frozen** — lane 03
codes against the contract, not against lane 02's implementation, so they run
in parallel (Mode A, no worktrees needed: the file areas are disjoint).

Lane 01's T-02 creates `api/prisma/schema.prisma` covering **all six tables**
(not only sprint 1's two) so that sprint 2's lanes never have to touch a
migration owned by another lane.

## Status board

Statuses: `todo → red (tests written) → green (code passes) → done (review
approved)`, or `blocked(<reason>)`.

| Task | Lane | Depends on | Status |
|---|---|---|---|
| T-01 | 01 | — | todo |
| T-02 | 01 | T-01 | todo |
| T-03 | 02 | T-01 | todo |
| T-04 | 02 | T-03 | todo |
| T-05 | 03 | T-01 | todo |
| T-06 | 03 | T-05 | todo |

## Tasks

### T-01 Repo scaffold and the gate  (lane 01, size ~2h)

- Criteria (B-001, spec §4):
  - npm workspaces `api` and `web`; root scripts `typecheck`, `lint`, `test`,
    `build` each fan out to both workspaces and exit non-zero on failure.
  - `framework/scripts/gate.sh` passes on the empty tree; `.github/workflows/ci.yml`
    runs the same script and is green.
  - One placeholder test per workspace, asserting a real value (not `expect(true)`).
- Depends on: —
- Files: `package.json`, `tsconfig.base.json`, `api/`, `web/` scaffolds,
  `.eslintrc.cjs`, `vitest.config.ts`, `.github/workflows/ci.yml`
- Read: `framework/docs/architecture.md` §1, `framework/docs/testing-strategy.md` §Commands,
  `framework/scripts/gate.config.sh`
- Out of scope: any feature code, any dependency not in architecture.md §1.

### T-02 Compose stack and the full schema  (lane 01, size ~2h)

- Criteria (B-002, database-schema.md):
  - `docker compose up` from a clean clone starts `db`, `api`, `web`; the api
    container runs `prisma migrate deploy` before listening; the printed URL
    serves the web app.
  - `GET /api/health` returns `{ ok: true, db: true }`.
  - Prisma schema and the initial migration define all six tables with the
    columns, checks and indexes in `framework/docs/database-schema.md`,
    including the two **partial** indexes on `generation_jobs` (raw SQL in the
    migration — Prisma cannot express them).
  - The app boots with `ANTHROPIC_API_KEY` unset (F-010).
- Depends on: T-01
- Files: `docker-compose.yml`, `api/Dockerfile`, `web/Dockerfile`,
  `.env.example`, `api/prisma/**`, `api/src/db/**`, `api/src/routes/health.ts`
- Read: `framework/docs/database-schema.md` (whole), `framework/docs/architecture.md` §5
- Out of scope: auth, CV, jobs — tables only, no services.

### T-03 Register  (lane 02, size ~2h)

- Criteria (F-001, C-001): all seven F-001 criteria that concern registration —
  argon2id hash, ≥10-char password, field-level 400s, 409 on duplicate with a
  generic message and no timing tell, no plaintext in any log.
- Depends on: T-01 (needs the gate), schema from T-02 for the integration test
  — the unit tests run against a test container started by the suite.
- Files: `api/src/core/auth/**`, `api/src/routes/auth.ts`, `api/src/http/errors.ts`,
  `tests/contract/auth-register.test.ts`
- Read: `framework/docs/api-contracts.md` C-000, C-001; `framework/docs/domain-model.md`
  User/Session; `.claude/rules/security.md`
- Test command for THIS lane: `npm -w api run test -- --run src/core/auth tests/contract/auth`
- Out of scope: login, sessions, anything under `web/`.

### T-04 Login, session, ownership guard  (lane 02, size ~2h)

- Criteria (F-001, C-002): cookie attributes exactly as specified, identical
  401 message for unknown email and wrong password, logout idempotent, `/me`,
  `requireUser` hook returning 401 before any work, and `assertOwnership`
  throwing `NotFound` (never `Forbidden`) — with a test proving another user's
  id yields 404.
- Depends on: T-03
- Files: as T-03 plus `api/src/http/requireUser.ts`,
  `tests/contract/auth-session.test.ts`
- Read: same as T-03, plus ADR-007
- Out of scope: rate limiting (B-019, sprint 3).

### T-05 Web shell  (lane 03, size ~2h)

- Criteria (B-005, F-009):
  - Vite + React + TanStack Query app; router with a public and a protected
    branch; a typed API client that parses the C-000 error envelope and
    surfaces `message` to the UI.
  - Design tokens from `framework/docs/design/design.json`; mobile-first
    layout: no horizontal scroll at 375×812, tap targets ≥44 px.
  - One smoke render test per screen.
- Depends on: T-01
- Files: `web/**`
- Read: `framework/docs/api-contracts.md` C-000; `framework/docs/design/README.md`;
  `framework/docs/spec.md` §3.9
- Out of scope: any api file; intake and editor screens (sprint 2/3).

### T-06 Auth screens  (lane 03, size ~2h)

- Criteria (F-001 from the user's side): sign-up and log-in forms with
  inline field errors from `details`, a protected `/cvs` page showing an
  empty state, session restored from `GET /api/auth/me` on mount so a reload
  stays signed in, logout returns to the public branch.
- Depends on: T-05
- Files: `web/src/features/auth/**`, `web/src/routes/**`
- Read: `framework/docs/api-contracts.md` C-001, C-002
- Out of scope: "remember me", password strength meters, the CV list's content.

## Risks / notes

- **E-001 applies:** while lanes run in parallel, each lane uses its own
  scoped test command from the table above, never the root `npm test`.
- T-02 writes the schema for tables sprint 2 will own. That is deliberate
  (one migration owner for the project) and must be stated in the lane report
  so sprint 2's Teamlead does not re-plan it.
- Likeliest escalation: the partial unique index in the Prisma migration
  (handwritten SQL). If Haiku fails twice, escalate per model-routing rather
  than letting it invent a Prisma feature that does not exist.
- Grep `framework/knowledge/errors.md` for: `prisma`, `docker`, `argon2`,
  `cookie`, `vitest`.
