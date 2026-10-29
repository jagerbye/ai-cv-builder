# api-contracts.md — interfaces between components

> **What this file is:** the frozen surface between components/services:
> endpoints, payloads, events, and module-level public interfaces. This is
> what makes OVERLAPPING parallel work safe: the Architect freezes the
> contract BEFORE teams start, each team codes against the contract, and the
> Integrator only has to reconcile implementations, not shapes.
> **Who writes it:** Architect; changes to a frozen contract require an ADR.
> **Who reads it:** every developer whose lane touches a boundary; the
> test-engineer (contract tests are generated from this file).

Rules:

- A contract is **frozen** once a sprint using it starts. Changing it
  mid-sprint = stop, escalate to Architect, new ADR, re-plan affected lanes.
- Every contract carries an ID (`C-NNN`) referenced by tasks and tests.
- Each endpoint/event: method+path (or event name), request, response,
  error cases. Error cases are not optional — they become tests.

Format:

```
## C-NNN <name>  (owner: <component>, consumers: <components>)
- `METHOD /path` | event `<name>`
- Request: <shape or link to domain-model entity>
- Response: <shape>; Errors: 4xx/5xx cases and their meaning
- Status: draft | frozen (sprint N)
```

---

## C-000 Global conventions (owner: api, consumers: web, tests)

- Base path `/api`. JSON in, JSON out, except C-009 (multipart in) and C-011
  (binary out).
- Session: `httpOnly` cookie `sid`. Every endpoint below except C-001/C-002
  requires it; missing or invalid → `401 UNAUTHENTICATED`.
- **Error envelope, every non-2xx:**
  `{ "error": { "code": "<ENUM>", "message": "<human, safe>", "details"?: [{ "path": "...", "message": "..." }] } }`
- Error code enum (closed): `VALIDATION`, `UNAUTHENTICATED`, `NOT_FOUND`,
  `CONFLICT`, `VERSION_CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_SOURCE`,
  `RATE_LIMITED`, `LLM_UNAVAILABLE`, `LLM_INVALID_OUTPUT`, `JOB_TIMEOUT`,
  `CONFIG_MISSING`, `INTERNAL`.
- Another user's entity is `404 NOT_FOUND`, never 403 (no existence leak).
- Timestamps are ISO-8601 UTC strings.
- Status: **frozen (sprint 1)**

## C-001 Register (owner: core/auth, consumers: web)

- `POST /api/auth/register`
- Request: `{ email: string(email), password: string(min 10, max 200) }`
- Response `201`: `{ user: { id, email } }` + `Set-Cookie: sid`
- Errors: `400 VALIDATION` (bad email / short password, with `details`);
  `409 CONFLICT` (email taken, generic message); `429 RATE_LIMITED`
- Status: **frozen (sprint 1)**

## C-002 Log in / log out / me (owner: core/auth, consumers: web)

- `POST /api/auth/login` — Request `{ email, password }` → `200 { user: { id, email } }` + cookie.
  Errors: `401 UNAUTHENTICATED` (same message for unknown email and wrong password); `429 RATE_LIMITED`
- `POST /api/auth/logout` → `204`, cookie cleared. Idempotent.
- `GET /api/auth/me` → `200 { user: { id, email } }` | `401 UNAUTHENTICATED`
- Status: **frozen (sprint 1)**

## C-003 Create CV from free text (owner: api + core/intake, consumers: web)

- `POST /api/cvs` with `Content-Type: application/json`
- Request: `{ sourceText: string(200..50000), targetRole: string(1..120) }`
- Response `201`: `{ cvId: uuid, jobId: uuid }`
- Errors: `400 VALIDATION` (missing/short/long field, or both `sourceText` and
  a file supplied); `429 RATE_LIMITED` (10 generations/hour)
- Status: **frozen (sprint 2)**

## C-004 Create CV from a PDF (owner: api + core/intake, consumers: web)

- `POST /api/cvs` with `Content-Type: multipart/form-data`
- Request: field `file` (one PDF, ≤10 MB, ≤20 pages), field `targetRole`
- Response `201`: `{ cvId, jobId }`
- Errors: `413 PAYLOAD_TOO_LARGE` (>10 MB);
  `400 UNSUPPORTED_SOURCE` with a message naming the fix — not a PDF
  (magic bytes), >20 pages, or <200 extractable characters ("this PDF looks
  like a scan; paste the text instead"); `400 VALIDATION` (no `targetRole`);
  `429 RATE_LIMITED`
- Note: the binary is **not** persisted; only the extracted text is.
- Status: **frozen (sprint 2)**

## C-005 Job status (owner: core/jobs, consumers: web)

- `GET /api/jobs/:jobId`
- Response `200`: `{ id, cvId, status: "queued"|"running"|"succeeded"|"failed",
  stage: "extracting"|"composing"|"verifying"|null, attempt: number,
  startedAt, finishedAt, error?: { code, message } }`
- Errors: `404 NOT_FOUND` (unknown job or another user's)
- Polling contract: the client polls every 2 s while `queued|running`; the
  server guarantees a terminal status within 180 s of `startedAt`.
- Status: **frozen (sprint 2)**

## C-006 Read a CV (owner: core/cv, consumers: web, core/export)

- `GET /api/cvs/:cvId`
- Response `200`:
  ```
  { id, title, targetRole, state: "generating"|"ready"|"failed",
    version: number, updatedAt,
    contact: { fullName?, email?, phone?, location?, links: string[] },
    summary?: { text, factIds: string[], userEdited: boolean },
    experience: [ { id, employer, role, period, location?, order,
                    relevance: number, userEdited: boolean,
                    bullets: [ { id, text, factIds: string[], userEdited } ] } ],
    education:  [ { id, institution, degree?, period, order, userEdited } ],
    skills:     [ { id, name, group?, factIds: string[], userEdited } ],
    questions:  [ { id, path, text, status: "open"|"answered"|"dismissed" } ],
    facts:      [ { id, kind, text, sourceQuote, source: "document"|"user" } ],
    lastError?: { code: <C-000 code>, message: string } }
  ```
- `lastError` (ADR-017) is present only when `state` is `failed`: the closed
  C-000 code and its fixed safe message, never a provider, driver or parser
  message. Absent in every other state; cleared by regenerate and by success.
- `facts` is what lets the UI show "where did this line come from" (F-004).
- **Question `path` grammar (clarified sprint 001, QA-05, ADR-016).** A question's
  `path` names the FIELD the question is about, never the item that holds it, so
  the editor can align the question beside that field. The grammar:
  `summary.text` | `skills[i].name` | `experience[i].(employer|role|period)` |
  `experience[i].bullets[j].text` | `education[i].(institution|period)`.
  Examples: `summary.text`, `skills[3].name`, `experience[1].period`,
  `experience[0].bullets[2].text`, `education[0].period`. A whole entry that is
  dropped (no citation, or an unknown citation) is questioned on its identifying
  field: `experience[i].employer` and `education[i].institution`. Whole items
  (an entry, a skill, the summary) never appear as a question path. Indices are
  positions in the drafted arrays, as the verifier emitted them.
  `questions[].path` is the only place this grammar applies; the dropped-item
  paths reported by the verifier keep their item-level spelling (`experience[0]`,
  `skills[3]`, `summary`) and are not part of this response.
- Errors: `404 NOT_FOUND`
- Status: **frozen (sprint 2)**; path grammar clarified (sprint 001)

## C-007 List / delete CVs (owner: core/cv, consumers: web)

- `GET /api/cvs` → `200 { items: [ { id, title, targetRole, state, updatedAt } ] }`,
  newest first, current user only.
- `DELETE /api/cvs/:cvId` → `204`; cascades facts, items, questions, jobs.
  Errors: `404 NOT_FOUND`
- Status: **frozen (sprint 3)**

## C-008 Edit a CV (owner: core/cv, consumers: web)

- `PATCH /api/cvs/:cvId`
- Request: `{ version: number, patch: { contact?, summary?, experience?,
  education?, skills? } }` — arrays are sent whole when reordering; any field
  present is replaced, absent fields are untouched.
- Response `200`: the full C-006 shape with `version + 1`; every touched field
  comes back `userEdited: true`.
- Errors: `409 VERSION_CONFLICT` (stale `version` — the client refetches and
  retries); `400 VALIDATION`; `404 NOT_FOUND`
- Status: **frozen (sprint 3)**

## C-009 Answer a question (owner: core/cv + core/generation, consumers: web)

- `POST /api/cvs/:cvId/questions/:questionId/answer`
- Request: `{ answer: string(1..2000) }`
- Response `200`: the full C-006 shape. Only the section owning the question's
  `path` may differ; everything else, and every `userEdited` field anywhere,
  is unchanged — this is asserted by a contract test. The top-level `version`
  is the exception and **bumps**: it is C-008's concurrency token, not content,
  and a section that changed under a still version is a section an open editor
  would silently overwrite (ADR-015).
- Errors: `404 NOT_FOUND`; `409 CONFLICT` (already answered);
  `503 LLM_UNAVAILABLE` (the targeted recompose failed; the answer is still
  stored as a fact and the question stays answered)
- Status: **frozen (sprint 3)**

## C-010 Regenerate (owner: core/jobs, consumers: web)

- `POST /api/cvs/:cvId/regenerate` → `202 { jobId }`; CV state back to
  `generating`. Fields marked `userEdited` survive the regeneration.
- Errors: `409 CONFLICT` (a job is already in flight); `404 NOT_FOUND`;
  `429 RATE_LIMITED`
- Status: **frozen (sprint 3)**

## C-011 Download PDF (owner: core/export, consumers: web)

- `GET /api/cvs/:cvId/pdf`
- Response `200`: `application/pdf`, `Content-Disposition: attachment;
  filename="<slug(fullName)>-<slug(targetRole)>.pdf"`. A4, real text layer.
- Errors: `404 NOT_FOUND`; `409 CONFLICT` (CV not in state `ready`)
- Status: **frozen (sprint 3)**

## C-013 Health (owner: api, consumers: compose healthcheck, tests)

- `GET /api/health` — no session required.
- Response `200`: `{ ok: true, db: true }` when a trivial query against
  PostgreSQL succeeds.
- Response `503`: `{ ok: false, db: false }` when it does not. The body carries
  no driver message, no connection string and no credentials — the reason goes
  to the log only.
- Status: **frozen (sprint 1)**

## C-012 Internal: the generation pipeline (owner: core/generation, consumers: core/jobs, tests)

Module-level contract — the seam the LLM is mocked at, so the whole suite runs
with no network and no key.

```ts
interface AnthropicGateway {           // the ONLY place the SDK is imported
  callTool<T>(req: ToolCallRequest<T>): Promise<T>   // validated against the schema
}
interface GenerationPipeline {
  extract(sourceText: string): Promise<Fact[]>
  compose(facts: Fact[], targetRole: string): Promise<CvDraft>   // never sees sourceText
  verify(draft: CvDraft, facts: Fact[]): VerificationResult      // pure, no I/O
}
type VerificationResult = { accepted: CvDraft; questions: QuestionDraft[]; dropped: DroppedItem[] }
```

- `verify` is synchronous and deterministic: same input, same output, no clock,
  no randomness — that is what makes the golden fixtures meaningful.
- `compose` receiving `sourceText` is a contract violation; the type makes it
  impossible and a test asserts the gateway was never called with it.
- Status: **frozen (sprint 2)**
