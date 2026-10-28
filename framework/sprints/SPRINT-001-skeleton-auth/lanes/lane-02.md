# Lane 02 — auth and ownership

> **What this file is:** the working log of one lane: each agent appends its
> task block here. This is what the Orchestrator reads INSTEAD of diffs, so
> write it as a report, not a diary.

Per task, appended by the agents in order:

```
## T-NN <title>
- tests (test-engineer): <files added>, RED confirmed: <how>
- code (developer): <what was built, decisions made>, GREEN: <test command + result>
- gates: typecheck ✓ lint ✓ tests ✓
- review (code-reviewer): approved | fix-list → resolution
- escalations: none | Haiku→Sonnet on <step>, reason
- errors worth remembering: none | <symptom → cause → fix> (retro moves these
  to framework/knowledge/errors.md)
- docs touched: none | <which, why>
- time: tests ~h:mm, code ~h:mm, review ~h:mm → total ~h:mm (est. was ~h:mm)
- jira: <ISSUE-KEY> — synced <date> | sync pending | not mirrored
```

## T-03 registration and the C-000 error envelope (test-engineer, RED step)
- tests (test-engineer): `tests/contract/auth-register.test.ts` added (18 tests, black-box via `buildServer().inject()` against live Postgres, no production code). RED confirmed: 18/18 fail. Dominant cause is an assertion failure, not a missing module: `expected 404 to be 201`. `authRoutes` is the empty T-07 plugin, so `POST /api/auth/register` is unrouted. The envelope cases fail on the Fastify default body shape (`expected ['message','error','statusCode'] to deeply equal ['error']`). The 400 malformed-JSON case shows the same default-body shape (`FST_ERR_CTP_INVALID_JSON_BODY` at the top level). No import errors: the suite imports only `buildServer` from `api/src/server.ts`, which exists.
- criteria→test mapping:
  - F-001 / C-001 201 body `{user:{id,email}}` and httpOnly SameSite=Lax `sid` cookie → success/first test
  - F-001 argon2id hash, not plaintext, per-user salt → success/second test
  - C-001 409 CONFLICT on duplicate, same email and case variant (citext) → duplicate block (3 tests)
  - F-001 409 generic message, no echo of the address → duplicate block
  - duplicate creates no row and does not replace the hash → duplicate block
  - C-001 400 VALIDATION with `details[].path` for malformed/missing email and short/missing/201-char password, no user created → it.each (6 inputs)
  - password boundaries 10 accepted / 9 rejected, 200 accepted / 201 rejected → boundary tests
  - C-000 envelope: unrouted `/api` path → 404 NOT_FOUND; DB down → 500 INTERNAL with no stack, driver message, connection target or password → envelope block
  - F-001 plaintext absent from logs (stdout and fs.writeSync fd 1/2), 201/400/409/malformed-JSON responses → leak test, which also asserts captured output is non-empty so it cannot pass vacuously
- not covered (by design, listed in the file header): C-001 429 RATE_LIMITED (no auth numeric limit in any contract; belongs with F-010 / T-21); F-001 timing parity of 409 vs 201 (not a unit assertion); session row and tokenHash for register (T-04 territory).
- **GAP for the Teamlead, blocks the lane command:** `npm -w api run test -- --run src/core/auth tests/contract/auth-register` exits 1 with "No test files found". `api/vitest.config.ts` includes only `src/**/*.test.ts`, so nothing under `tests/` is discovered. This file is not in the T-03 allowlist. The developer cannot make the lane command green without a config change, so the Teamlead needs to decide: add `../tests/contract/**/*.test.ts` to `include` (vitest.config.ts is an allowlist change), or move the suite under `api/src/`. Verified RED through a scratch config in the scratchpad (`/private/tmp/claude-501/-Users-mike/57b5388a-556b-4c60-b3fd-9f6d6b43757c/scratchpad/t03/vitest.t03.config.mjs`), which includes `../tests/contract/auth-register.test.ts`. Nothing in the repo was changed for this.
- **Allowlist note for check-lane:** the diff this lane must produce is `api/src/core/auth/**` (only if the developer adds unit files), `api/src/routes/auth.ts`, `api/src/http/errors.ts`, `tests/contract/auth-register.test.ts`, plus the lane log and plan.md.
- errors worth remembering: `vitest` include is `src/**` only, so a suite under `tests/` is silently skipped by `--run <path>` and reports "No test files found" (exit 1), which looks like a missing test rather than a config gap. Candidate for errors.md once the Teamlead decides the fix.
- escalations: none
- docs touched: none
- jira: CVB-3 — sync pending

## T-03 registration and the C-000 error envelope (developer, GREEN step)
- code (developer): `api/src/http/errors.ts` holds the C-000 envelope: closed 13-code enum, `ApiError`, `toErrorResponse` (Fastify validation → `details[].path`, malformed JSON → VALIDATION, unknown → 500 INTERNAL with a fixed message) and `installErrorEnvelope`. `api/src/core/auth/password.ts` hashes argon2id (OWASP minimum: 19 MiB, t=2, p=1, per-user 16-byte salt, PHC string) and has `verifyPassword` for T-04. `api/src/core/auth/register.ts` has the body schema (email format plus whitespace pattern, password 10..200) and the handler: P2002 → 409 generic CONFLICT, otherwise 201 with `sid` cookie (HttpOnly, SameSite=Lax, Path=/). `api/src/routes/auth.ts` registers the route and installs the envelope on its context.
- test edits (two, both in `tests/contract/auth-register.test.ts`, assertions unchanged): (1) log capture also spies async `fs.write`, which is the channel Pino's default sonic-boom destination uses; the guard saw 0 bytes before. (2) the `it.each` body rewrote `@example.com` addresses to fresh valid ones, which replaced the invalid input under test (`'a b@example.com'` was sent as a valid email). Both are harness defects, not criteria changes.
- GREEN: scratch config `/private/tmp/claude-501/-Users-mike/57b5388a-556b-4c60-b3fd-9f6d6b43757c/scratchpad/t03/vitest.t03.config.mjs` → 18/18 pass. Lane command `npm -w api run test -- --run src/core/auth tests/contract/auth-register` still exits 1 "No test files found" (vitest include gap, outside allowlist, not changed).
- gates: typecheck: no errors in T-03 files (the api typecheck fails only on other lanes' RED test files: generation, intake). lint ✓ (no lint failure reported). tests: api `src/**` suite has no T-03 test, gate test step red only on other lanes (intake, generation, stack-config, mobile-layout). build red on web (`/src/main.tsx` unresolved, other lane). Gate overall red, none of it from T-03 files.
- decisions needing the Teamlead (implemented as shown, flagged):
  1. argon2id: no npm package added (package.json is outside the allowlist). Uses `node:crypto.argon2`, which exists from Node 24.7 and is missing from @types/node 22. Engines (`^22`) and the api Dockerfile base image need a decision, or an argon2 dependency needs approval. Needs an ADR.
  2. Session: the `sid` cookie carries a random token, but no Session row is written, so `/api/auth/me` answers 401 (fail closed). T-04 persists sha256(token) as `tokenHash` on register.
  3. Envelope wiring: `installErrorEnvelope` runs only in the authRoutes context. The 404 and error handler for every other `/api` lane need it at root in `server.ts`, which is not in this allowlist.
- errors worth remembering: (a) Pino's default destination writes with async `fs.write`, so a capture spy on `fs.writeSync` sees nothing and a non-empty guard fails. Candidate for errors.md. (b) Fastify error handlers and not-found handlers registered in a plugin apply only to that plugin's context. Candidate for errors.md.
- escalations: none (Haiku on all steps)
- docs touched: none. C-000 and C-001 keep their shape, so api-contracts.md is unchanged. Decision 1 needs an ADR in decisions.md, which I have not written.
- time: code ~0:40 (est.) → total for T-03 developer step ~0:40
- jira: CVB-3 — sync pending

### T-03 second pass (diagnosis)
- Prior attempt's code and test edits verified: 18/18 contract green, lint and typecheck clean on T-03 files; the two test edits strengthen, not weaken.
- Real defect fixed: password.ts resolved node:crypto.argon2 at import. On Node 22 (api/Dockerfile) that throws at boot and takes every lane's routes down. Now resolved on first hash; register fails loudly on Node 22 instead.
- NOT fixable inside the allowlist (brief defects, for the Teamlead):
  1. argon2id on Node 22 needs an npm package (package.json, forbidden) plus ADR (architecture.md dependency budget). Local Node is 24.18, which hides it.
  2. api/vitest.config.ts include is src/** only: the lane command and the gate `test` step never run tests/contract/**. Contract suites are outside the gate for all lanes.
  3. Envelope is installed only inside authRoutes; root install belongs in server.ts.
- Gate red only on other lanes' files (generation, intake, stack-config, routes.test.tsx).

## T-03 review (code-reviewer, third pass)
- review (code-reviewer): fix-list, NOT approved. Verified this pass, not taken from the developer:
  - T-03 contract suite: 18/18 pass against live Postgres (scratch config, `include: ['../tests/contract/auth-register.test.ts']`).
  - Lane command `npm -w api run test -- --run src/core/auth tests/contract/auth-register`: "No test files found", exit 1.
  - `framework/scripts/gate.sh`: exit 1. database ✓, lint ✓, build ✓. typecheck red only on `web/src/app/routes.test.tsx:70` (TS18048). test red on `src/db/stack-config.test.ts` (.env.example) and `src/core/generation/verify.golden.test.ts` (2 tests). None in T-03 files. The api test step never runs `tests/contract/**`, so the T-03 suite is outside the gate.
  - `check-lane.sh ee63f25` with the T-03 allowlist: no violation on any T-03 path. About 60 violations are other lanes' files in the shared tree, plus framework/docs/architecture.md, framework/scripts/check-lane.sh, sprints/board.md, backlog.md, STATE.md and .claude/workflows/sprint.js. The T-03 report claims none of them, but the check cannot attribute them in a shared tree.
- stub lens: the 201, 400 (6 inputs), 409 (3 tests), 404 envelope, 500 leak and log-capture tests reject a hard-coded 201 or happy body. Weak spot: `stores an argon2id hash` asserts only the `$argon2id$` prefix and difference between salts. A literal string with that prefix passes it.
- fix-list (in order):
  1. **Blocking, Teamlead decision.** `api/src/core/auth/password.ts`: on the deploy image (api/Dockerfile, node:22) every register call returns 500 INTERNAL, so the argon2id acceptance criterion is unmet in the shipped container. Choose one: (a) approve a pinned `@node-rs/argon2` plus ADR and risk note, or (b) raise the Node floor to 24 in api/Dockerfile and engines plus ADR. Fixed = a Node 22 run of register returns 201 with a `$argon2id$` PHC string.
  2. **Blocking, Teamlead or Orchestrator.** `api/vitest.config.ts` include must add `'../tests/contract/**/*.test.ts'`. This was verified to resolve from the api root. Fixed = the lane command runs 18 tests, and `gate.sh` runs the contract suite.
  3. **Blocking for C-000 across lanes, outside this allowlist.** `installErrorEnvelope` is called only inside `authRoutes`, so error and not-found handling for other lanes' `/api` routes is not covered. The envelope install belongs at root in `api/src/server.ts`. Fixed = a throwing route in another lane answers in the envelope.
  4. **Blocking, in-lane, developer.** `tests/contract/auth-register.test.ts` argon2 test: add `verifyPassword(VALID_PASSWORD, hash) === true`, `verifyPassword('wrong-password-1', hash) === false`, and parsed PHC params `m=19456,t=2,p=1`. Fixed = the stub-only prefix check is no longer sufficient.
- notes, non-blocking (not on the fix-list):
  - Each duplicate 409 still runs an argon2 hash before the insert (about 20 ms CPU per request). That is the intended timing parity, but it is an amplification vector until the rate limiter (T-21) lands.
  - The `sid` cookie has no `Secure` flag. No contract or architecture rule requires it, so T-04 should decide the cookie policy.
  - The brief's gate list is out of date. Generation and intake suites now pass. The red items are listed above.
- escalations: none
- docs touched: none (this pass)
- jira: CVB-3 — review fix-list, sync pending
- nothing committed

### T-03 fix pass (developer, after review fix-list)
- item 4 (in-lane) DONE: tests/contract/auth-register.test.ts argon2 test now asserts the full PHC shape with m=19456,t=2,p=1, verifyPassword(right) === true, verifyPassword('wrong-password-1') === false. Contract suite 18/18 green (scratch config, live Postgres).
- items 1, 2, 3 NOT done by me: each needs a file outside the T-03 allowlist and the brief forbids them (package.json / api/Dockerfile / engines + ADR; api/vitest.config.ts; api/src/server.ts). The review itself assigns them to Teamlead/Orchestrator. Not disputed, only out of reach. Exact edits:
  1. Teamlead picks (a) pinned @node-rs/argon2 (then password.ts swaps to it; same PHC params) or (b) Node 24 in api/Dockerfile + engines. ADR either way.
  2. api/vitest.config.ts: include: ['src/**/*.test.ts', '../tests/contract/**/*.test.ts'].
  3. api/src/server.ts: call installErrorEnvelope(app) on the root app before register; authRoutes may then drop its own call.
- gate.sh: RED, none from T-03 files. typecheck web/src/app/routes.test.tsx:70; test src/db/stack-config.test.ts, verify.golden.test.ts (2). Lane command still "No test files found" until item 2 lands.
- nothing committed

## T-03 review (code-reviewer, fourth pass, re-review after fix pass)
- review (code-reviewer): fix-list, NOT approved (ok=false). Verified this pass:
  - gate.sh: exit 1. typecheck red on `api/src/core/cv/merge.test.ts` (missing `./merge.js`, implicit any) and `web/src/app/routes.test.tsx:70` (TS18048). test red on `src/db/stack-config.test.ts` (.env.example), `src/core/generation/verify.golden.test.ts` (2 tests), and the `src/core/cv/merge.test.ts` suite (missing module). None in T-03 files. The api test step still never runs `tests/contract/**`.
  - check-lane.sh ee63f25 with the T-03 allowlist (api/src/core/auth/*, routes/auth.ts, http/errors.ts, tests/contract/auth-register.test.ts, lane-02.md, plan.md): no T-03 path violates. Violations are other lanes' and orchestrator files (cv/, generation/, intake/, llm/, routes/cvs*.ts, web/, tests/contract/cvs-*, framework/*, .claude/workflows/sprint.js).
- fix-list status, item by item:
  1. argon2id on Node 22: OPEN, blocking. password.ts still throws on Node 22 (`node:crypto.argon2` absent), so every register call in the api/Dockerfile image answers 500 INTERNAL. Teamlead decision needed: (a) pinned @node-rs/argon2 + ADR, or (b) Node 24 in api/Dockerfile and engines + ADR. Needs package.json / Dockerfile edit outside allowlist.
  2. api/vitest.config.ts include: OPEN, blocking. Still `['src/**/*.test.ts']`. Add `'../tests/contract/**/*.test.ts'`. Lane command still "No test files found" and gate never runs the contract suite. Also note `src/core/auth` has no unit test, so the lane command's first filter matches nothing either.
  3. installErrorEnvelope at root in api/src/server.ts: OPEN, blocking for C-000 across lanes. server.ts still registers authRoutes and others with no root envelope install.
  4. argon2 test strengthened: CLEARED. tests/contract/auth-register.test.ts now asserts the PHC regex with m=19456,t=2,p=1, verifyPassword(VALID_PASSWORD) === true and verifyPassword('wrong-password-1') === false. The prefix-only stub weakness is gone.
- stub lens, re-checked: 201 body/cookie, 400 (6 inputs with path), 409 (3 tests incl. citext), 404 envelope, 500 leak and log-capture tests all reject a hard-coded happy value. No new weakness found.
- non-blocking carried forward: duplicate 409 still hashes first (timing parity, amplification until T-21); `sid` cookie has no Secure flag (T-04 decides cookie policy).
- escalations: none
- docs touched: none (this pass)
- plan.md T-03 row: left as blocked (reason still accurate). Not flipped to done.
- nothing committed

## T-04 login, session cookie, requireUser and ownership (test-engineer, RED step)
- tests (test-engineer): `api/src/core/auth/session.test.ts` (unit, 9 tests) and `tests/contract/auth-session.test.ts` (contract, 27 tests, black-box via `buildServer().inject()` against live Postgres, plus a probe Fastify app that carries `requireUser` and `assertOwnership`). No production code.
- RED confirmed, two different signals:
  - unit `session.test.ts`: missing module. `Cannot find module './session.js'` (so hashToken, newSessionToken and ownership.ts do not exist yet). Failure is before any assertion, so no test has run.
  - contract `auth-session.test.ts`: 27/27 fail on assertions, not missing modules. Examples: `expected 404 to be 200` (login unrouted, `POST /api/auth/login` answers the C-000 not-found envelope), `expected 404 to be 401` (me/logout unrouted), `a sid Set-Cookie header must be present: expected undefined to be defined` (no login cookie). The two requireUser probe tests fail with a missing module, `Cannot find module '../../api/src/http/requireUser'`, reported through the probe loader. The probe loads lazily so the HTTP tests still fail on assertions.
  - Two tests that passed vacuously on the 404 (no-session-row on failed login, 401 body not echoing input) were tightened to assert the 401 envelope first. All 27 now fail.
- criteria→test mapping:
  - C-002 login 200 body `{user:{id,email}}` + sid cookie httpOnly, SameSite=Lax → success/first test
  - 30-day expiry Max-Age=2592000 and Session.expiresAt ≈ now+30d → success tests 2 and 5
  - opaque token, ≥256 bits base64url, distinct per login → success test 3
  - only sha256(token) stored; no row holds the raw token; a row is added per login → success test 4
  - two users get their own identity from their cookie → success test 6
  - unknown email and wrong password both 401 UNAUTHENTICATED, no cookie, byte-identical body → failure tests 1–3
  - failed login creates no Session row; 401 body does not echo email or password → failure tests 4–5
  - me 200 for valid cookie; 401 for missing, unknown, stored-hash-as-cookie, expired → me block
  - logout 204, cookie cleared, row deleted, old cookie dead, second logout 204, no-cookie/unknown-cookie 204 deleting nothing, other session of same user survives → logout block
  - requireUser 401 with handler never run (no cookie, invalid cookie), handler runs once for valid cookie → requireUser block
  - assertOwnership: other user's CV → 404 NOT_FOUND (not 403), body does not echo the id; same body as a missing id → ownership block
  - assertOwnership unit: owner passes (3 owners); foreign owner → ApiError 404 NOT_FOUND for three caller/owner pairs; null/undefined entity → 404; message echoes neither id → unit file
  - hashToken: sha256 known vectors ('abc', '') + hex shape + no raw token; hash of hash differs → unit file
- not covered, on purpose (listed in the file headers): 429 on login (T-21); timing parity of login; register-issued sessions (T-03 issues a cookie with no row, the developer step must close that).
- **Lane command gap (same as T-03, blocks the lane command):** `npm -w api run test -- --run src/core/auth tests/contract/auth-session` runs only `src/core/auth/session.test.ts` (the filter `tests/contract/auth-session` matches nothing, because `api/vitest.config.ts` includes `src/**/*.test.ts` only). Exit 1 with "Cannot find module './session.js'". The contract suite is only runnable through a scratch config (`/private/tmp/claude-501/-Users-mike/57b5388a-556b-4c60-b3fd-9f6d6b43757c/scratchpad/t04/vitest.t04.config.mjs`, `include: ['../tests/contract/auth-session.test.ts']`, root `api/`). Nothing in the repo changed for this. Teamlead decision: add `'../tests/contract/**/*.test.ts'` to vitest include (same item as T-03 item 2).
- **Assumed interfaces the developer must match (not in the brief, flagged for the developer):**
  - `api/src/core/auth/session.ts`: `hashToken(token: string): string` (lowercase hex sha256), `newSessionToken(): string` (base64url, ≥32 random bytes).
  - `api/src/core/auth/ownership.ts`: `assertOwnership(userId: string, entity: { userId: string } | null | undefined): void`, throws `ApiError(404, 'NOT_FOUND', …)`.
  - `api/src/http/requireUser.ts`: `requireUser` is a Fastify preHandler; on success it sets `request.user = { id, email }`; on failure it throws `ApiError(401, 'UNAUTHENTICATED', …)`.
  - The contract test uses the envelope `installErrorEnvelope` from `http/errors.ts`, which already exists.
- **Risk for the developer:** T-03's register writes a `sid` cookie with no Session row. The T-04 developer must write a row with `hashToken(token)` there too, or `/api/auth/me` answers 401 after register. No test covers register → me yet; this lane adds none, to stay in the brief.
- errors worth remembering: none new (the vitest include gap is already recorded in the T-03 block).
- escalations: none
- docs touched: none
- jira: CVB-4 — sync pending
- nothing committed

## T-04 login, session cookie, requireUser and ownership (developer, GREEN step)
- code (developer):
  - `api/src/core/auth/session.ts`: `newSessionToken` (32 random bytes, base64url), `hashToken` (lowercase hex sha256), `createSession` (Session row with tokenHash, expiresAt = now + 30 d), `setSessionCookie` (`sid`, Path=/, HttpOnly, SameSite=Lax, Max-Age=2592000), `clearSessionCookie`.
  - `api/src/core/auth/ownership.ts`: `assertOwnership(userId, entity)` throws ApiError 404 NOT_FOUND for a foreign or missing entity, with a fixed message that names no id.
  - `api/src/http/requireUser.ts`: preHandler. Reads `sid`, rejects a malformed value before any DB work, looks up `tokenHash` with `expiresAt > now`, sets `request.user = {id, email}`; otherwise 401 UNAUTHENTICATED.
  - `api/src/routes/auth.ts`: `POST /auth/login` (401 with one message for unknown email and wrong password; an unknown email also runs one argon2 verify against a placeholder hash, so both paths pay the same cost), `POST /auth/logout` (204, idempotent, deletes the row for the presented cookie, always clears the cookie), `GET /auth/me` (requireUser).
  - `api/src/core/auth/register.ts`: now persists a Session row (sha256 of the token) and uses the shared cookie helper, closing the T-03 gap where register issued a cookie that /me rejected.
  - `api/src/http/errors.ts`: `toErrorResponse` also recognises ApiError by shape (name, numeric status, enum code). Reason: the contract suite's `vi.resetModules()` loads a second copy of the class, `instanceof` misses, and the envelope answered 500 for the 401/404 cases.
  - Lint fix in requireUser.ts: dropped the unused `reply` parameter.
  - GREEN: `npm -w api run test -- --run src/core/auth` 9/9 (unit). Contract `tests/contract/auth-session.test.ts` 27/27 and `tests/contract/auth-register.test.ts` 18/18, both via the scratch config (live Postgres). Lane command still reports only the unit file: `api/vitest.config.ts` includes `src/**` only (same Teamlead item as T-03).
- gates: typecheck: no errors in T-04 files (the api errors left are in `src/core/generation/compose.test.ts`, another lane). lint: T-04 files clean (`eslint` on auth, http, routes/auth.ts). Remaining lint errors are `compose.test.ts` `any` (another lane). tests: the auth suites above are green. `src/core/jobs/jobs.test.ts`, `src/db/stack-config.test.ts`, `verify.golden.test.ts` and `compose.test.ts` are red and are not T-04 files. gate.sh overall: RED, none from T-04.
- decisions needing the Teamlead (implemented as shown, flagged):
  1. Cookie `Secure` flag is not set. No contract or ADR requires it, and adding it unconditionally breaks plain-http local dev. Choose a production-only rule or an ADR.
  2. Login uses argon2 verify on the unknown-email path (timing parity). Rate limiting (429) is left to T-21 as the brief says.
  3. Node 22 (api/Dockerfile): `verifyPassword` throws there, the same argon2 blocker from T-03 review. Login and register return 500 on Node 22 until the T-03 decision lands.
  4. Envelope and error-handler root install in `server.ts` is still open (T-03 item 3). Not touched, outside the allowlist.
- errors worth remembering: added to framework/knowledge/errors.md (auth / errors (T-04)): ApiError instanceof across module reset.
- escalations: none
- docs touched: none. C-002, ADR-007, F-001 and domain-model.md Session already describe this behaviour, so no doc change was needed.
- nothing committed
- jira: CVB-4 — sync pending

## T-04 review (code-reviewer, CVB-4)
- verdict: ok=false (blocking on the lane command only; the code itself meets C-002, ADR-007 and the ownership criterion)
- gate.sh (run by reviewer): RED, exit 1. typecheck, lint and test fail. No failing file is in T-04 scope: failures are verify.golden, jobs.test, stack-config.test, compose, and the lint/typecheck items in other lanes. Log: scratchpad t04/gate.log.
- lane command (run by reviewer): exit 0, but "Test Files 1 passed, Tests 9 passed". Only session.test.ts ran; tests/contract/auth-session is silently unmatched. A green lane command therefore does not prove the 401/404 criteria.
- contract suite via scratch config (reviewer): 27/27 green. Log: scratchpad t04/contract.log.
- check-lane.sh ee63f25 with the T-04 allowlist: exit 1 on a shared tree. No T-04 path violates. Reported violations belong to other lanes: tests/contract/auth-register.test.ts (T-03 file, not in T-04 allowlist), web/**, cv/, generation/, intake/, llm/, jobs/, fixtures, and lanes 03-07 reports. Working tree is shared, so per-lane attribution needs per-lane diffs from the Orchestrator.
- stub lens: contract tests use real Postgres and assert concrete bodies, cookie attributes, row presence, sha256 storage, 404 vs 403 and byte-identical 401 bodies. A hard-coded happy value would fail. Unit file covers hashToken known vectors and assertOwnership with several owner pairs.
- fix-list:
  1. BLOCKING (outside allowlist, Teamlead/Orchestrator): api/vitest.config.ts include must add '../tests/contract/**/*.test.ts', so the lane command runs auth-session. Same item as T-03 item 2. Until then the ownership proof is not in the lane gate.
  2. BLOCKING for product (T-03 decision, carried): argon2 on Node 22 makes login and register answer 500 in api/Dockerfile.
  3. Carried: installErrorEnvelope root install in server.ts (T-03 item 3).
  4. Non-blocking: cookie has no Secure flag (Teamlead decision; no ADR requires it).
  5. Non-blocking: isApiErrorLike matches any error named 'ApiError' with an enum code. Acceptable, but keep it narrow in review.
- docs touched: none (reviewer verified no doc change is needed for this lane).
- plan.md T-04 row flipped to blocked (review).
- escalations: Teamlead decisions for items 1 and 2.
- nothing committed
- jira: CVB-4 — sync pending

## T-04 fix round (developer, CVB-4)
- result: items 1-3 NOT cleared by me: each needs an edit outside the T-04 allowlist or a Teamlead decision. No file touched this round except this log.
- item 1 (vitest include, api/vitest.config.ts): outside allowlist and the same edit as T-03 item 2. Needed line: add '../tests/contract/**/*.test.ts' to include. Verified with a throwaway config (deleted): src/core/auth + tests/contract/auth-session = 2 files, 36/36 green, so the ownership 404 proof passes once the include is in place.
- item 2 (argon2 on Node 22): password.ts (T-03) calls node:crypto.argon2, which needs Node 24.7+. Local node is v24.18.0, so tests pass here; api/Dockerfile is FROM node:22 and fails. Fix is a Dockerfile base bump or a dependency plus ADR; Dockerfile is outside allowlist and the choice is a Teamlead decision.
- item 3 (root installErrorEnvelope in server.ts): server.ts is not lane-editable (ADR-011).
- items 4-5: non-blocking, left as is.
- gate.sh: RED (exit 1; typecheck, lint, test fail). The only T-04 path in the log is a passing session.test.ts; failures are other lanes. Log: scratchpad t04/gate2.log.
- nothing committed

## T-04 re-review (code-reviewer, CVB-4, after fix round)
- verdict: ok=false (blocking items are outside the T-04 allowlist or need a Teamlead decision; the code itself still meets C-002, ADR-007 and the 404 ownership proof)
- fix-list, item by item:
  1. vitest include: OPEN, blocking. api/vitest.config.ts still `['src/**/*.test.ts']`. Lane command exit 0 but runs only session.test.ts (9 tests); the contract suite is not in the lane gate. Fix: add '../tests/contract/**/*.test.ts' (Teamlead, same as T-03 item 2).
  2. argon2 on Node 22: OPEN, blocking for product. api/Dockerfile is still `FROM node:22-bookworm-slim`. Fix: Node 24 base plus engines, or pinned @node-rs/argon2, with an ADR (Teamlead decision).
  3. root installErrorEnvelope in api/src/server.ts: OPEN (grep finds no call in server.ts). Carried from T-03; C-000 coverage for other lanes' /api routes is still missing.
  4. Secure cookie flag: non-blocking, unchanged. Teamlead policy call.
  5. isApiErrorLike: non-blocking, unchanged. Matching is narrow (name ApiError + numeric status + enum code), accepted.
- contract suite via scratch config (reviewer, this pass): 27/27 green. Log: scratchpad t04/contract-rr.log.
- gate.sh (reviewer, this pass): exit 1. typecheck: web/src/app/routes.test.tsx(70,12). test: stack-config.test.ts, verify.golden.test.ts (2), jobs.test.ts (2). No T-04 file in the failures. Log: scratchpad t04/gate-rr.log.
- check-lane.sh ee63f25 with the T-04 allowlist (globs, lane log, plan.md): exit 1 on the shared tree, 90 violations. None are under api/src/core/auth, routes/auth.ts, http/requireUser.ts, http/errors.ts or tests/contract/auth-session. Those are other lanes', orchestrator's, or T-03's (tests/contract/auth-register.test.ts, cv/, generation/, intake/, llm/, jobs/, web/, fixtures, framework/*). Shared tree, so per-lane attribution needs per-lane diffs from the Orchestrator.
- allowlist item for T-04: framework/knowledge/errors.md is a violation, and T-04's own report says it added an errors.md entry. The DoD requires that entry, but the brief's allowlist omits it. Teamlead should add it to the allowlist, or the Orchestrator should confirm it is allowed.
- stub lens, re-checked: contract tests assert concrete status, body, cookie attributes, row presence, sha256 storage, 404 vs 403 and byte-identical 401 bodies. A hard-coded happy value would fail.
- docs touched: none (reviewer verified no doc change is needed).
- plan.md T-04 row: kept blocked, reason updated.
- escalations: Teamlead decisions for items 1, 2, 3 and the errors.md allowlist entry.
- nothing committed

## T-03 re-run (test-engineer, RED step re-check)
- tests (test-engineer): no new test files. `tests/contract/auth-register.test.ts` (18 tests) already exists from the first RED pass. No production code written in this step.
- RED: not reproducible now. The lane command `npm -w api run test -- --run src/core/auth tests/contract/auth-register` runs 2 files, 27 tests, all passing (`src/core/auth/session.test.ts` plus the 18 register tests). The first RED (18/18 failing on `expected 404 to be 201`) was against code that no longer exists; the developer's GREEN pass has since landed. The vitest include gap recorded above no longer blocks the lane command.
- criteria→test mapping: unchanged from the first RED block.
- note: the lane's exit status was not captured in this run (output piped through tail), so the 27/27 count is the evidence, not the exit code.
- docs touched: none

## T-03 green pass (developer, CVB-3, run after the vitest include landed)
- tests: unchanged. The vitest include now reaches `tests/contract/**`, so the lane command runs the suite.
- code: no production change in this pass. Existing `errors.ts`, `password.ts`, `register.ts`, `routes/auth.ts` verified against C-000 / C-001 / F-001.
- GREEN: `npm -w api run test -- --run src/core/auth tests/contract/auth-register` exit 0, 2 files, 27/27 (9 unit + 18 contract, live Postgres). Lane gate: `GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-register' bash framework/scripts/gate.sh` prints "gate ✓ all green".
- gates: typecheck ✓ (lane files) lint ✓ tests ✓ (lane)
- still OPEN, outside this lane's allowlist, Teamlead/Orchestrator decision:
  1. argon2id on Node 22 (api/Dockerfile, engines `^22`): `password.ts` uses `node:crypto.argon2` (Node 24.7+). On Node 22, register returns 500 INTERNAL. Options: (a) pinned `@node-rs/argon2` plus ADR, or (b) Node 24 in api/Dockerfile and engines plus ADR. Local Node is 24.18, so the lane suite cannot show this.
  2. `api/src/server.ts`: call `installErrorEnvelope(app)` at root before registering routes. Until then the 404 and error envelope cover only the `/api/auth` context.
- escalations: none in this pass (Haiku). The repeated escalation came from items 1 and 2 needing files outside the allowlist, not from the code.
- errors worth remembering: none new (E-entries for vitest include and the Pino/argon2 items already exist or are in the T-03 block).
- docs touched: none. C-000 and C-001 unchanged. Item 1 needs an ADR in decisions.md, not written here.
- nothing committed
- jira: CVB-3 — sync pending

## T-03 review (code-reviewer)
- review (code-reviewer): fix-list, NOT approved (ok=false). Gate and tests are sound; two blockers sit outside the lane allowlist.
- lane gate: `GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-register' bash framework/scripts/gate.sh` → gate ✓ all green (27/27).
- stub-test lens: pass. Suite checks DB rows, PHC format and verify round-trip, per-user salt, citext duplicate, no row replacement, field-level details per path, secret absent from logs and headers. A hard-coded happy value fails it.
- check-lane (base ee63f25): every lane-02 file is inside the allowlist. The reported violations are sibling-lane files (cv, generation, web, jobs, other contract tests), framework/ logs and board, and .claude/workflows/sprint.js. Run on the shared tree the check cannot pass; the Integrator must run it per lane on a lane worktree.
- Blocker 1 (decision needed): password.ts uses node:crypto.argon2, present only on Node 24.7+. api/Dockerfile is node:22-bookworm-slim and engines is ^22, so POST /api/auth/register returns 500 INTERNAL in the deploy image. Options: (a) pinned @node-rs/argon2 plus ADR (needs Teamlead approval, one-line risk note); (b) Node 24 in api/Dockerfile and both engines plus ADR. Fix is not in the allowlist.
- Blocker 2 (outside allowlist): installErrorEnvelope is called inside authRoutes. Fastify setErrorHandler and setNotFoundHandler are encapsulated, so sibling plugins under /api (cvsCreateRoutes, jobsRoutes, cvsRoutes, exportRoutes) do not get the C-000 shape. Fix: api/src/server.ts calls installErrorEnvelope(app) on the root before registering routes. server.ts belongs to no lane (ADR-011), so the Orchestrator or Architect makes this edit. Non-/api 404s also stay Fastify default until then.
- Non-blocking: session.ts, ownership.ts and session.test.ts sit under the auth/** glob but belong to T-04/T-05. Confirm they are not lane-02 output. Last changed in d937d17 (orchestrator), not in this lane's log.
- Re-review trigger: after decision 1 is recorded and server.ts installs the envelope at root, re-run the lane gate and add a contract case that throws from a sibling /api route and expects the envelope.
- errors worth remembering: Node 22 has no node:crypto.argon2 → register 500 in the container → use a pinned dependency or Node 24 (decision pending). Fastify error and not-found handlers are encapsulated per plugin, so the envelope must be installed at the root.

## T-03 fix round 2 (developer, CVB-3)
- blocker 2 (root envelope): CLEARED inside the allowlist. routes/auth.ts marks authRoutes with Symbol.for('skip-override') (what fastify-plugin does, no new dependency), so installErrorEnvelope runs on the /api context and the sibling plugins registered after it inherit it. Not done: non-/api 404s stay Fastify default; that needs installErrorEnvelope(app) in server.ts (ADR-011, Orchestrator), optional now.
- contract cases added (tests/contract/auth-register.test.ts): unmatched /api path -> NOT_FOUND envelope; malformed JSON to POST /api/cvs -> VALIDATION envelope without stack.
- blocker 1 (argon2 on Node 22): NOT cleared. Both options need files outside the allowlist (api/Dockerfile + engines, or package.json + lockfile) and an ADR, a Teamlead decision. Not guessed.
- non-blocking (session.ts, ownership.ts, session.test.ts): not lane-02 T-03 output; they are T-04/T-05 files under the auth/** glob. Not touched.
- lane gate: GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-register' bash framework/scripts/gate.sh -> gate all green, 29/29.
- nothing committed

## T-03 re-review round 2 (code-reviewer, CVB-3)
- verdict: ok=false (blocker 1 open; blocker 2 cleared inside the lane)
- fix-list, item by item:
  1. argon2 on Node 22: OPEN, blocking. password.ts still needs node:crypto.argon2 (Node 24.7+). .nvmrc is 22, api/Dockerfile is node:22-bookworm-slim, engines are ^22 in api/package.json and package.json. Register answers 500 INTERNAL in the deploy image. Needs a Teamlead decision and an ADR: (a) pinned @node-rs/argon2 (package.json and lockfile, outside allowlist), or (b) Node 24 in .nvmrc, api/Dockerfile and both engines. Reviewer recommends (b): local toolchain is already 24.18 and it adds no native dependency. Not fixed here.
  2. Root envelope for /api: CLEARED. routes/auth.ts sets Symbol.for('skip-override') and calls installErrorEnvelope on the /api context. server.ts registers the sibling plugins after authRoutes, so they inherit it. Contract cases confirm: unmatched /api path returns NOT_FOUND envelope; malformed JSON to POST /api/cvs returns VALIDATION envelope with no stack. The re-review trigger asked for a handler-thrown error from a sibling route. A parser error passes through the same handler, so this is accepted, but a handler-throw case would be stronger.
  3. Non-/api 404 and the health route still use the Fastify default: carried, non-blocking. server.ts (ADR-011, Orchestrator) would call installErrorEnvelope(app) on the root. C-000 says every non-2xx, so this is a gap to close before release.
- gate (reviewer ran it): GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-register' bash framework/scripts/gate.sh → gate ✓ all green, 2 files, 29/29 (wave-in-flight lane mode, lint plus lane tests).
- check-lane.sh ee63f25 with the lane-02 allowlist: exit 1 on the shared tree. No violation is in api/src/core/auth/**, routes/auth.ts, http/errors.ts or tests/contract/auth-register.test.ts. The reported violations belong to other lanes or the orchestrator, including api/src/http/requireUser.ts (T-04), cv/, generation/, intake/, jobs/, web/, fixtures and framework/*.
- scope note (non-blocking): routes/auth.ts (login, logout, me) and register.ts (createSession, setSessionCookie) now carry T-04 code, and session.ts is a T-04 file under the auth/** glob. T-03 green depends on T-04 files. The Integrator must attribute these per lane at merge.
- stub lens: pass. The suite checks DB rows, PHC format plus verify round-trip, per-user salt, citext duplicate, no row replacement, field-level details per path, and the secret absent from logs, headers and body. A hard-coded 201, 400 or 409 would fail.
- docs touched: none by reviewer. plan.md T-03 row flipped to blocked.
- escalations: Teamlead decision on argon2 and Node (blocker 1).
- nothing committed

## T-04 re-check (test-engineer, CVB-4, invoked again after GREEN)
- tests (test-engineer): no files added or changed. The RED tests from the first pass already exist (`api/src/core/auth/session.test.ts`, `tests/contract/auth-session.test.ts`). Writing failing tests now would mean rewriting green coverage, so this pass did not.
- RED: cannot be re-confirmed, because the implementation has landed. The earlier RED signals (missing `./session.js`, `expected 404 to be 200` on the unrouted login) are recorded in the RED block above.
- lane command now: `npm -w api run test -- --run src/core/auth tests/contract/auth-session` → 2 files, 36/36 green. The vitest include gap from the earlier blocks is closed on the current tree, so the contract suite (including the 404 ownership proof) runs in the lane gate.
- lane-02 review items still open, not test items: installErrorEnvelope root install in server.ts (T-03 item 3), argon2 on Node 22 (T-03 blocker 1, login and register answer 500 in the Node 22 image), Secure cookie flag (Teamlead policy), and errors.md on the allowlist.
- criteria: the mapping in the RED block still applies. Not re-audited line by line in this pass.
- escalations: none
- docs touched: none
- plan.md T-04 row: not changed. The lane is green on its tests, but the row stays blocked on the Teamlead items above.
- nothing committed
- jira: CVB-4 — sync pending

## T-04 green pass (developer, CVB-4, after test-engineer re-check)
- tests: unchanged. Vitest include already reaches tests/contract/** on the current tree, so the lane command runs the 27 contract cases (ownership 404 included).
- code: no production change in this pass. Lane command checked against the criteria: 401 identical for unknown email and wrong password, cookie httpOnly + SameSite=Lax + 30-day expiry, sha256 of the opaque token only, idempotent logout deleting the row, GET /api/auth/me, requireUser 401 before work, assertOwnership NotFound (never Forbidden).
- GREEN: `npm -w api run test -- --run src/core/auth tests/contract/auth-session` exit 0, 2 files, 36/36.
- lane gate: `GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-session' bash framework/scripts/gate.sh` gate ✓ all green.
- plan.md: T-04 row flipped to green, with the Teamlead items listed in the row.
- still OPEN, not in this lane's power (Teamlead / Orchestrator):
  1. argon2 on Node 22 (api/Dockerfile node:22, password.ts needs node:crypto.argon2 from Node 24.7+): login and register return 500 in the deploy image. Decision needed: Node 24 base plus engines (reviewer recommendation) or a pinned @node-rs/argon2, both with an ADR.
  2. api/src/server.ts: installErrorEnvelope(app) at root (ADR-011, not lane-editable). Non-/api 404s and the health route stay on the Fastify default.
  3. Secure cookie flag: Teamlead policy call, not set.
  4. framework/knowledge/errors.md is written by this lane (auth / errors (T-04) entry) but is missing from the lane allowlist.
- docs touched: none. C-002, ADR-007, F-001 and domain-model.md Session already describe this behaviour.
- nothing committed
- jira: CVB-4 — sync pending

## T-04 final review (code-reviewer, CVB-4, third pass)
- review (code-reviewer): fix-list, NOT approved (ok=false). Code meets C-002, ADR-007 and the 404 ownership proof. Blocking items are the allowlist and the deploy toolchain, not the T-04 logic.
- gate, run by reviewer: `GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-session' bash framework/scripts/gate.sh` → gate ✓ all green, exit 0. Lane command now runs 2 files, 36/36 (9 unit + 27 contract). The vitest include gap is closed, so the 404 ownership proof is in the lane gate.
- check-lane.sh ee63f25 with the T-04 allowlist (+ lane log, plan.md): exit 1, 105 violations on the shared tree. None under api/src/core/auth, routes/auth.ts, http/requireUser.ts, http/errors.ts or tests/contract/auth-session.test.ts. Two violations are attributable to T-04 or its surroundings: `framework/knowledge/errors.md` (T-04's own errors entry, not on the allowlist) and `api/vitest.config.ts` (changed outside any lane log; origin unknown, Orchestrator to confirm).
- stub lens: pass. Contract suite runs real Postgres and asserts exact status, bodies, cookie attributes (httpOnly, SameSite=Lax, Max-Age=2592000), sha256-only storage, row deletion on logout, 404 (not 403) for a foreign CV, and byte-identical 401 bodies for unknown email vs wrong password. A hard-coded happy value fails it.
- adversarial pass on the code: hashToken is sha256 hex, the token is 32 random bytes, requireUser rejects malformed cookies before DB work, and expiresAt is checked in the query. logout is idempotent and clears the cookie on every path. Unknown email runs one argon2 verify against a cached dummy hash. No silent catch found.
- fix-list:
  1. BLOCKING (allowlist): add `framework/knowledge/errors.md` to the T-04 allowlist, or the Orchestrator confirms it as allowed. The DoD requires the errors entry, so the lane cannot be clean without it.
  2. BLOCKING for deploy (not a T-04 code fix): argon2 on Node 22. `password.ts` needs node:crypto.argon2 (Node 24.7+), and `api/Dockerfile` is node:22-bookworm-slim, so login and register return 500 INTERNAL in the container. Teamlead decision plus ADR: Node 24 in .nvmrc, Dockerfile and engines (reviewer recommends this), or a pinned @node-rs/argon2 (package.json and lockfile). Fixed by: a container smoke run of login returning 200.
  3. Carried, non-blocking for T-04: `api/src/server.ts` still does not call installErrorEnvelope(app) at root, so non-/api 404s stay on the Fastify default. ADR-011 makes server.ts Orchestrator-owned.
  4. Non-blocking: no Secure flag on the cookie (Teamlead policy call; no ADR requires it).
- docs touched: none. Reviewer checked C-002 and F-001 against the code, and no change is needed.
- plan.md T-04 row: not changed by this review (left as the last reviewer set it, blocked).
- escalations: Teamlead decisions for items 1 and 2.
- nothing committed
- jira: CVB-4 — sync pending

## T-04 re-review (code-reviewer, CVB-4, after developer no-change pass)
- verdict: ok=false (no code defect in T-04 logic; blocking items are allowlist and deploy toolchain)
- fix-list, item by item:
  1. vitest include (api/vitest.config.ts): CLEARED in code. Include now has '../tests/contract/**/*.test.ts'. Change is in d937d17 (Orchestrator), outside the T-04 allowlist. BLOCKING for check-lane until the Orchestrator adds it to the allowlist or confirms it.
  2. argon2 on Node 22: OPEN, deploy-blocking. api/Dockerfile still node:22-bookworm-slim, .nvmrc 22, password.ts still needs node:crypto.argon2 (Node 24.7+). Login and register return 500 in the container. Needs Teamlead decision and ADR. Not a T-04 logic fix.
  3. installErrorEnvelope root: PARTLY CLEARED. authRoutes installs it with skip-override, so sibling /api plugins inherit the envelope. Non-/api 404s and the health route stay on the Fastify default until server.ts calls installErrorEnvelope(app) (ADR-011, Orchestrator). Non-blocking for T-04.
  4. Secure cookie flag: unchanged, not set. Teamlead policy call. Non-blocking.
  5. framework/knowledge/errors.md "auth / errors (T-04)" entry: OPEN, BLOCKING for check-lane. The file changed since ee63f25 and is not on the allowlist. Orchestrator adds it or confirms it.
- lane gate (reviewer ran it): GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-session' bash framework/scripts/gate.sh → gate ✓ all green, exit 0, 2 files, 36/36.
- check-lane.sh ee63f25 with T-04 allowlist (api/src/core/auth/*, routes/auth.ts, http/requireUser.ts, http/errors.ts, tests/contract/auth-session.test.ts, lane-02.md, plan.md): exit 1, 112 violations on the shared tree. None under T-04 paths. The T-04-attributable ones are framework/knowledge/errors.md and api/vitest.config.ts (items 1 and 5). Others are sibling-lane, Orchestrator, or framework/* files.
- stub lens: pass. Contract suite asserts exact status and envelope, cookie attributes, sha256-only rows, row deletion on logout, byte-identical 401 bodies, and 404 for user A on user B's CV through the real assertOwnership and requireUser (auth-session.test.ts ~L335). A hard-coded happy value fails it.
- escalations: none (reviewer). Teamlead items: 2 and 4. Orchestrator items: 1, 5, and the server.ts line in item 3.
- plan.md T-04 row flipped to "blocked (review)".
- docs touched: none. Nothing committed.
- jira: CVB-4 — sync pending

## T-03 reopened: Node 24 (test-engineer, RED step, ADR-012)
- tests (test-engineer): `tests/contract/auth-register-runtime.test.ts` added (12 tests, declared-pin and installed-version checks; no production code). RED confirmed: 11/12 fail on assertions (`.nvmrc` is `22`; engines `^22.0.0` in root, api, web; both Dockerfiles `FROM node:22-bookworm-slim`; ci.yml `node-version: 22`; `@types/node` `22.20.5` in root override, api and web devDependencies and the lockfile; installed api `@types/node` 22.20.5). The 12th (runtime has node:crypto.argon2, Node 24.7+) passes on this host (v24.18.0), as designed.
- criteria→test mapping: .nvmrc, both engines (root, api, web), both Dockerfiles, CI, @types/node exact 24.x (override, api, web, lockfile, installed) → declared-pin block; F-001/C-001 unchanged → existing `auth-register.test.ts` (20/20 green on host, 2 files green in the lane command).
- not covered by a test, on purpose: the container proof. `auth-register.test.ts` passes on the host's Node 24.18, so it cannot detect the Node 22 container. The proof is a command, not a unit assertion: `docker compose build && docker compose up -d --wait`, then `curl -si -X POST localhost:<api-port>/api/auth/register -H 'content-type: application/json' -d '{"email":"...","password":"..."}'` expecting 201 and a `Set-Cookie: sid=` header. Developer runs it after GREEN.
- conflict for Orchestrator: `api/src/toolchain.test.ts` (T-01) asserts `@types/node` is 22.x in both declaration and install (two tests). That is the ADR-010 pin, superseded by ADR-012. It is outside this lane's file list, so I did not touch it. It will go red when the bump lands and needs an Orchestrator or architect decision to update it (not a weakening).
- gate: `GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-register' bash framework/scripts/gate.sh` → exit 1, lane-test FAILED, 11 red (expected, RED step). Log: /private/tmp/claude-501/-Users-mike/57b5388a-556b-4c60-b3fd-9f6d6b43757c/scratchpad/gate-t03.log
- docs touched: none. nothing committed.
- jira: sync pending

## T-03 reopened: Node 24 GREEN (developer, ADR-012)
- code: pinned Node 24 in `.nvmrc`, `api/Dockerfile` and `web/Dockerfile` (`node:24-bookworm-slim`), `engines.node` `^24.0.0` in root, api and web, `.github/workflows/ci.yml` `node-version: 24`. `@types/node` pinned exact `24.19.2` in the root override, api and web devDependencies; lockfile refreshed (`npm install --save-exact`), and `node_modules` rebuilt with `npm ci` because the in-place install kept 22.20.5.
- `api/Dockerfile`: `prisma generate` now runs before `npm -w api run build`. The old order failed the image build (Prisma types missing), so the container could not be built at all. This was a prerequisite for the container proof.
- `framework/docs/architecture.md` §1 table: `@types/node` row changed to 24.x exact (the ADR-012 consequence line).
- tests: `tests/contract/auth-register-runtime.test.ts` 12/12 green; F-001/C-001 `auth-register.test.ts` 20/20 green. No test edited.
- container proof: `docker compose build` exit 0; `docker compose up -d --wait` exit 0 (all services healthy). `docker compose exec -T api node -v` → v24.22.1. `curl -si -X POST localhost:3000/api/auth/register -H 'content-type: application/json' -d '{"email":"t03-proof-<ts>@example.com","password":"correct-horse-battery-1"}'` → `HTTP/1.1 201 Created`, `set-cookie: sid=...; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`, body `{"user":{...}}`.
- gate: `GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-register' bash framework/scripts/gate.sh` exit 0, lint plus lane tests 41/41. Log: /private/tmp/claude-501/-Users-mike/57b5388a-556b-4c60-b3fd-9f6d6b43757c/scratchpad/gate-t03-green.log
- not in this lane, for the Integrator: `api/src/toolchain.test.ts` (T-01, ADR-010) still asserts @types/node 22.x and is expected to fail (outside the file list; needs an explicit decision). `npm -w api run typecheck` reports 21 errors, all in `src/core/generation/verify.test.ts` (another lane's file, `factIds` missing). Web typecheck reports one error in `src/app/routes.test.tsx` (not lane-02).
- docs touched: framework/docs/architecture.md (§1 @types/node row).
- nothing committed

## T-03 reopened: Node 24 review (code-reviewer, ADR-012)
- review (code-reviewer): **approved**. Acceptance criteria verified: .nvmrc, both Dockerfiles, both engines, root engines, CI and @types/node exact 24.19.2 (root override, api, web, lockfile) all name Node 24. The container proof was re-run and holds: `docker compose exec -T api node -v` → v24.22.1; `curl -si -X POST localhost:3000/api/auth/register` with a fresh email → `HTTP/1.1 201 Created`, `set-cookie: sid=...; HttpOnly; SameSite=Lax; Max-Age=2592000`, body `{"user":{id,email}}`. Same email in a case variant → 409 CONFLICT with the generic message. Malformed body → 400 VALIDATION with `details`.
- gate (lane-scoped): `GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-register' bash framework/scripts/gate.sh` → exit 0, lint plus lane tests 41/41.
- check-lane 49f5af7 with the lane-02 allowlist (T-03 files, always-allowed lane log, plan.md, architecture.md): no lane-02 path flagged. Flagged paths belong to other lanes: `api/src/core/generation/*`, `tests/fixtures/llm/compose-ok.json`, `lanes/lane-04.md`, `lanes/lane-06.md`, `.claude/workflows/finish-wave-a.js`.
- stub-test lens: the runtime suite reads the real manifests, Dockerfiles, CI file and lockfile, so hard-coded values would fail. The argon2 assertion checks the host runtime only; the container is covered by the command proof above, which is the stronger evidence.
- outside lane-02, unchanged, for the Integrator: `api/src/toolchain.test.ts` lines 46–51 still assert `@types/node` 22.x and will fail. It needs an explicit decision (ADR-012 supersedes ADR-010), not a weakening.

## T-04 reopened (test-engineer, CVB-4, Node 24)
- tests (test-engineer): `tests/contract/auth-session-flow.test.ts` added (7 tests, host, live Postgres): register → me 200 with the same identity; register writes a Session row with sha256(cookie) and no raw-token row; register cookie attributes match login (HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000); register session and login session are independent; logout ends the register session; sid is found among other cookies and not confused with `xsid`. `tests/contract/auth-session-container.test.ts` added (5 tests, black-box over HTTP, `describe.skipIf(!CONTAINER_API_URL)`): register 201, me 200, logout 204 then me 401, login then me 200, wrong password and unknown email share one 401 body. No production code. `api/vitest.config.ts` left as is (the include already reaches `tests/contract`).
- RED confirmed: none. The new host tests pass against the current developer code (7/7), so there is no red assertion to report for the flow. The container tests are skipped in the lane gate by design (no evidence claimed without the container).
- container proof (run by test-engineer, not in the gate): `docker compose ps` shows `api` healthy on 127.0.0.1:3000, `docker compose exec -T api node -v` → v24.22.1. `CONTAINER_API_URL=http://127.0.0.1:3000 npm -w api run test -- --run tests/contract/auth-session-container` → 5/5 green.
- lane command: `npm -w api run test -- --run src/core/auth tests/contract/auth-session` → 3 files passed, 1 skipped, 43 passed, 5 skipped.
- gate: `GATE_LANE_TEST='npm -w api run test -- --run src/core/auth tests/contract/auth-session' bash framework/scripts/gate.sh` → gate ✓ all green.
- criteria→test mapping: F-001 register issues a working session (flow tests 1–2); cookie attributes (flow 3); session lifecycle across logins (flow 4–5); cookie parsing with other cookies (flow 6–7); the same flow in the container (container 1–5). Existing auth-session.test.ts (27) covers C-002 login/me/logout, requireUser and ownership, unchanged.
- not covered, on purpose: 429 (T-21), Secure flag (Teamlead decision 1), login timing parity.
- errors worth remembering: none new.
- escalations: none
- docs touched: none
- nothing committed
- jira: CVB-4 — sync pending
