# architecture.md — system architecture

> **What this file is:** HOW the system is built: components, boundaries,
> data flow, stack, and the reasoning that is still current. Big choices with
> alternatives considered are recorded as ADRs in `decisions.md`; this file
> describes the resulting shape.
> **Who writes it:** Architect agent. **Who reads it:** Teamlead (to split
> work along component boundaries), developers (their component's section).

## 1. Stack

| Choice | Version | Why (one line) |
|---|---|---|
| TypeScript | 5.6 | one language across api and web; the type is the contract the cheap models code against |
| Node.js | **24 LTS** | required by the brief; `node:crypto.argon2` is stdlib from 24.7, which removes a native dependency (ADR-012) |
| Fastify | 5 | REST with schema-per-route validation built in — the validation rule of F-010 is structural, not a habit |
| PostgreSQL | 16 | required option in the brief; `FOR UPDATE SKIP LOCKED` gives a job queue without a broker (ADR-004) |
| Prisma | 5 | migrations as checked-in SQL + typed client; raw SQL where the queue needs it |
| `@anthropic-ai/sdk` | 0.x pinned | the only LLM path allowed by the brief; tool-use gives schema-shaped output |
| `pdf-parse` (pdf.js) | pinned | text extraction from the uploaded PDF, pure JS, no native build |
| `pdfjs-dist` | 5 (dev) | test-only: reads text runs and their positions back out of the generated PDF, which is how F-007's "real text layer" and the A4 margins are asserted rather than assumed. Added by T-19 and approved 2026-10-28 |
| `@fastify/multipart` | 9 | C-004 is a file upload; without a multipart parser the route can only answer 415. Added 2026-10-28 — the third time §1 was found incomplete, and the first two were caught by the same symptom |
| `@react-pdf/renderer` | 4 | A4 PDF with a real text layer, server-side, no headless browser (ADR-005) |
| React + Vite | 18 / 5 | smallest credible SPA toolchain |
| TanStack Query | 5 | server state, polling and cache invalidation are the whole frontend problem here |
| Vitest + Supertest + Testing Library | current | one runner for api and web |
| `@vitejs/plugin-react` | 4 | without it `npm run build` for web is a bare `tsc`, which never produces a bundle |
| `happy-dom` | 15 | Vitest environment for web tests; lighter than jsdom and enough for Testing Library |
| ESLint + `typescript-eslint` | 9 / 8 | `lint` in gate.config.sh must be a real linter; `tsc` with extra flags is a stand-in that silently passes style and correctness rules |
| `@types/node` | **24.x exact** | the runtime is Node 24; an unpinned types package type-checks against APIs the container does not have |
| `@types/react`, `@types/react-dom` | 18.x | without them no `.tsx` type-checks, so the web app cannot mount at all |
| `@testing-library/dom` | 10.x | a peer of `@testing-library/react`; listed because it installs either way and an unlisted dependency is an unreviewed one |
| Docker Compose | v2 | the brief's only run target: `docker compose up` |

Dependency budget is deliberate: every entry above is load-bearing. Adding one
needs Teamlead approval in the lane report (`.claude/rules/coding-standards.md`).

The toolchain rows were added on 2026-10-28 after T-01: the original list named
only runtime libraries, so the scaffold had no linter, no DOM test environment
and no web bundler, and the developer had to improvise all three. The React
type packages were added on the second pass, when the same gap stopped the web
entry point from being written. A dependency list that omits the toolchain is
an incomplete contract, not a lean one — and "no new dependencies" is only a
safe rule while the approved list is complete.

**Install scripts.** npm 11 does not run a dependency's install script unless
it is approved. `prisma`, `@prisma/client` and `esbuild` need theirs (client
generation and the native binary), and they are approved: configure the
allowance in the repo, do not work around it by vendoring or by skipping
`prisma generate`.

## 2. Components

### 2.1 `api/` — HTTP surface (owner of the request/response contract)

- **Responsibility:** authentication, authorization, request validation,
  REST endpoints from `api-contracts.md`, error-shape normalisation, rate
  limiting. Thin: it validates, calls a service, serialises.
- **Owned data:** none directly — it goes through the services below.
- **Public surface:** `framework/docs/api-contracts.md` (C-001…C-012).
- **Must NOT:** call the Anthropic SDK, run a generation inline, or build SQL.
- **Rate limits (F-010, T-21):** one hook set in `server.ts` on the `/api` context
  (`http/rateLimit.ts`), keyed by the session user. 10 generations per hour (create and
  regenerate, slot released when the answer is not 2xx) and 60 writes per minute (POST, PATCH,
  DELETE). Fixed windows on the injected clock. Counters are in-process, which is correct for the
  single-container deployment only. A second instance needs a shared store before limits hold.
- **Session:** `http/requireUser.ts` is the one cookie-to-user resolver (ADR-007). The error
  envelope is installed on `/api` by `server.ts`.

### 2.2 `core/auth` — identity

- **Responsibility:** registration, password hashing (argon2id), login,
  session cookies, the `requireUser` hook, and the `assertOwnership(userId,
  entity)` helper every other service calls.
- **Owned data:** `users`, `sessions`.
- **Must NOT:** be bypassed by any other component — ownership is checked in
  the service layer, not only in routes (`.claude/rules/security.md`).

### 2.3 `core/intake` — source acquisition

- **Responsibility:** accept a PDF or free text, validate it (size, magic
  bytes, page count, extracted length), extract plain text, persist it as the
  CV's immutable source, discard the binary.
- **Owned data:** `cvs.source_text`, `cvs.source_kind`.
- **Must NOT:** call the LLM, interpret the content, or keep the upload.

### 2.4 `core/generation` — the grounded pipeline (the heart of the product)

Three stages, two of them LLM calls and one of them ordinary code:

| Stage | Kind | In → out |
|---|---|---|
| `extract` | LLM (tool use, strict schema) | source text → `Fact[]`, each with `sourceQuote` copied verbatim from the source |
| `compose` | LLM (tool use, strict schema) | `Fact[]` + target role → `CvDraft` where every content item cites `factIds` and carries a `relevance` score |
| `verify` | **pure code, no LLM** | `CvDraft` + `Fact[]` → accepted `CvDraft` + `Question[]` |

- **Responsibility:** owns prompts, the Anthropic gateway (`gateway.ts`: the
  only SDK import — timeouts, retries, the token ledger), the schemas, and the
  verifier.
- **Gateway retries (ADR-029).** A 429, a 5xx or a transport failure is
  retried; 401/403 (`LLM_AUTH_FAILED`) and any other 4xx
  (`LLM_INVALID_REQUEST`) fail at once. The wait is the provider's
  `Retry-After` (delta-seconds or HTTP date) when present, floored at the base
  and capped at what is left of the budget; otherwise base × 2^(n−1) with up to
  +50% jitter. Attempts are bounded by a **waiting budget per provider
  request**, not by a count (a 12-attempt ceiling is a sanity brake only); when
  the next wait would not fit, the call fails with the failure's own code. Two
  settings: `ANTHROPIC_RETRY_BASE_SECONDS` (2) and
  `ANTHROPIC_RETRY_BUDGET_SECONDS` (20). `callTool` makes up to two schema
  attempts, so one generation can wait about twice the budget — inside C-005's
  180 s. The tests drive this with an injected clock, sleep and random.
- **Token ledger (ADR-021).** The spend budget is **per job**: the worker
  creates one `TokenLedger` per run and every stage — extract, compose, a schema
  retry — spends from it; the answer path (C-009) creates one per answer of the
  same size. Nothing is sent once it is empty and an overdrawing response is
  discarded unexamined; both are `LLM_BUDGET_EXCEEDED`. `max_tokens`
  (`ANTHROPIC_MAX_OUTPUT_TOKENS`) bounds one response and is a different
  number from `ANTHROPIC_TOKEN_BUDGET_PER_JOB`.
- **Owned data:** `facts`, `cv_sections`/`cv_items`, `questions`.
- **Must NOT:** write HTTP responses, and — the rule the whole product rests on
  — **the `compose` call must never receive the raw source text.** It sees the
  extracted facts only. A fact that was not extracted cannot be composed, so an
  invented employer has nowhere to come from (ADR-002).
- **The verifier is the enforcement**, not the prompt (ADR-025, 027, 028):
  for every item it checks that the cited facts exist. A **structured** item —
  experience entry, education entry, skill, contact field — must be named as a
  whole word in a cited fact (employer, institution, skill name, contact value;
  one name-edge rule in `verify-entities.ts`) or it is dropped and becomes a
  priority-1 question. **Prose** — the summary and bullet text — is never
  dropped: an unsupported name, figure, technology or duration raises a
  priority-2 question beside it. Prompts ask nicely; the verifier is what is
  tested. A question is stored against the item's id, and its `path` is
  derived at read time (ADR-027).

### 2.5 `core/jobs` — durable async work

- **Responsibility:** enqueue a generation, lease it to an in-process worker,
  expose status/stage, reclaim leases from dead workers, enforce the 180 s
  budget, record failure reasons.
- **Owned data:** `generation_jobs`.
- **Must NOT:** hold state in memory that a restart would lose — the row is the
  state (ADR-003, ADR-004).

### 2.6 `core/cv` — the document

- **Responsibility:** read a CV with its items, questions and facts; apply
  partial user edits with optimistic concurrency; mark `userEdited`; apply a
  question's answer to the one bound path and recompose only that section;
  list and delete.
- **Owned data:** the `cvs` aggregate (shared ownership of `cv_items` with
  `core/generation`: generation writes them on create, `core/cv` on edit).

### 2.7 `core/export` — PDF

- **Responsibility:** render a stored CV to A4 PDF bytes with a real text
  layer, embedded Unicode font, pagination.
- **Owned data:** none (pure function of a CV).

### 2.8 `web/` — React SPA

- **Responsibility:** auth screens, intake form, progress view, CV editor with
  inline questions, CV list, download. Server state through TanStack Query;
  the progress view polls `GET /api/jobs/:id` and is reconstructed from the
  server on mount, so a reload is indistinguishable from a first load (F-003).
- **Must NOT:** hold user-visible state only in `localStorage`, or decide
  authorization.

**How the browser reaches the api.** The browser only ever talks to the web origin
(`http://127.0.0.1:${WEB_PORT}`, 5273 by default), so the SPA and the api are
same-origin and the session cookie needs no CORS. Vite forwards every `/api/*`
request to the api through a proxy: `server.proxy` in `npm run dev` and
`preview.proxy` in the web container, both declared once in `web/vite.config.ts`.
The target comes from `API_PROXY_TARGET`, which defaults to `http://127.0.0.1:3000`
for running on the host and is set to `http://api:3000` by `docker-compose.yml`.
Nothing else sits between the browser and the api. The api is also published on
host port 3000 (`127.0.0.1:3000`) for direct curl and debugging, but the browser
uses only the web origin. (Sprint 001, QA-01.)

## 3. Data flow

**Generation (the main path):**

1. `POST /api/cvs` → `api` validates, `core/auth` identifies the user.
2. `core/intake` validates the PDF/text, extracts text, writes `cvs` row with
   `source_text`, state `generating`; the binary is dropped.
3. `core/jobs` inserts a `generation_jobs` row (`queued`) in the **same
   transaction** as the CV. Response `201 {cvId, jobId}` — within 2 s.
4. The worker leases the job (`SELECT … FOR UPDATE SKIP LOCKED`), sets
   `running`, stage `extracting`.
5. `core/generation.extract` → `facts` rows written with their `sourceQuote`.
6. Stage `composing`: `compose` receives **facts only** → `CvDraft`.
7. Stage `verifying`: the verifier accepts/drops items, emits questions.
8. Accepted items → `cv_items`; questions → `questions`; CV state `ready`;
   job `succeeded`.
9. The browser has been polling `GET /api/jobs/:id` throughout and switches to
   the editor; a reload at any point resumes from step 9's poll.

**Answering a question:** `POST …/answer` → the answer is stored as a
user-sourced fact → only the section owning the bound item is recomposed and
re-verified, with its own token ledger → an entry, education or skill the new
evidence supports is restored (ADR-027) → `userEdited` fields in that section
are preserved verbatim.

**Failure:** any stage throwing → job `failed` with a classified code, CV state
`failed` with `last_error_code`/`last_error_message` set in the same
transaction (served as C-006 `lastError`, ADR-017; cleared by regenerate and by
success), source text intact, `regenerate` offered. Nothing is half-written:
each stage commits its own rows, and a retry starts from `extract`.

## 4. Cross-cutting concerns

- **Auth:** `httpOnly` `SameSite=Lax` session cookie, 30-day expiry, opaque
  random id stored hashed. Every service function that takes an entity id
  takes a `userId` too and calls `assertOwnership`, which throws `NotFound` —
  never `Forbidden` — for someone else's row.
- **Validation:** JSON Schema per route (Fastify), and the same discipline at
  the model boundary: every LLM response is parsed against a strict schema
  before it is looked at. **Model output is untrusted input** —
  `.claude/rules/security.md` applies to it exactly as to a form post.
- **Prompt-injection containment:** source text is always delivered inside a
  single labelled, delimited block with an instruction that its content is
  data; the extract stage's schema has no field through which an instruction
  could take effect, and the compose stage never sees the source at all.
- **Errors:** one `AppError{code, httpStatus, message}` type; a route-level
  serialiser emits `{ error: { code, message, details? } }`. Unexpected
  exceptions become `INTERNAL` with a correlation id; the detail goes to the
  log, never to the client.
- **Logging:** structured JSON to stdout, one line per request plus one per job
  stage with duration and token counts. Redaction list covers `password`,
  `cookie`, `authorization`, `apiKey`. Prompt bodies are logged only at
  `debug`, never by default.
- **Config:** `env.ts` parses `process.env` once against a schema at boot and
  fails loudly on a bad value — except `ANTHROPIC_API_KEY`, which is allowed to
  be absent so the app still boots (F-010).
  `ANTHROPIC_MODEL` and `ANTHROPIC_BASE_URL` are optional and also parsed there
  (the base URL must be http(s); a bad one fails boot naming the variable, never
  the value). The gateway passes the base URL to the SDK client as `baseURL` only
  when set, so the default endpoint is untouched; it exists for an
  Anthropic-compatible proxy, the Messages API wire format stays the contract.
  It is a host plus an optional path prefix and excludes `/v1`: the SDK appends
  `/v1/messages`, so a base that already ends in `/v1` requests `/v1/v1/messages`.
- **Time:** all timestamps UTC, `timestamptz`.

## 5. Constraints

- Node.js backend and a REST API — no GraphQL, no RSC-style server actions.
- **Every LLM call speaks the Anthropic Messages API** (to Anthropic, or to a
  compatible proxy via `ANTHROPIC_BASE_URL`). No other provider, no local
  model, not even for embeddings — if something needs embeddings, redesign it.
- PostgreSQL only; no Redis, no S3, no broker. Anything that looks like it
  needs one must be reconsidered (ADR-004).
- The whole system must come up with `docker compose up` and nothing else.
- `ANTHROPIC_API_KEY` is the only secret; the owner uses their own key, so cost
  control is a courtesy requirement, not an optional one (token budget per job).
- No deployment, no staging, no CI-to-env flow: the staging half of
  `framework/process/task-lifecycle.md` does not apply to this project.
- No Jira/Figma integration configured → file-only flow
  (`.claude/rules/integrations.md`).
- Budget: the brief's reference point is 10 human-hours. Any proposal that
  cannot be cut down to fit the sprint plan in `framework/sprints/` is wrong by
  definition — see the README's "what we cut" section.
