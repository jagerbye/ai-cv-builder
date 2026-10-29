# Lane 08 — wave B

> Lane log. Each task appends: what changed, the lane test command and its
> result, docs touched, decisions needed, `time:` per role.


## T-21 — red tests (test-engineer)

- Added: `tests/contract/hardening-envelope.test.ts`, `tests/contract/hardening-session.test.ts`, `tests/contract/hardening-ratelimit.test.ts`. No production code.
- Interface the tests assume: `buildServer({ now?: () => number })` (injected clock). Rate-limit window type is not pinned; boundaries are probed at whole-hour and whole-minute T0.
- Lane gate: `GATE_LANE_TEST='npm -w api run test -- --run src/http src/routes tests/contract/hardening' bash framework/scripts/gate.sh`. Lane tests: 16 red, 33 green across the 5 files matched. Lint step red on `web/src/features/cv/testkit.ts` (lane 09 file, not this lane).
- Red for the right reason: rate limits (no hook, no clock option; 11th generation and 61st write return 201/400); regenerate (route not present, 404); session (401 messages differ from canonical envelope, two source-level checks fail because jobs.ts and cvs-create.ts still hand-roll the lookup); envelope source check (server.ts does not call installErrorEnvelope).
- Green on arrival: envelope behaviour (404 NOT_FOUND on unmatched /api paths, 500 INTERNAL with no stack or secret). The envelope is already installed by `auth.ts` (skip-override plugin), so the premise that it is missing is only half true.
- Decision needed: the 401 message changes from 'Sign in required.' (jobs) and 'sign in before creating a CV' (cvs-create) to the canonical 'Sign in is required.' from requireUser.

## T-21 — implementation (developer)

- Changed: `api/src/http/requireUser.ts` (adds `resolveSessionUser`, shared with the rate-limit hook; `requireUser` reuses a user already resolved). New `api/src/http/rateLimit.ts` (fixed-window limiter, one onRequest and one onSend hook). `api/src/server.ts` (`buildServer({ now? })`, installs the envelope and the rate-limit hook on `/api`). `api/src/routes/auth.ts` (envelope install and skip-override removed; the envelope now comes from server.ts). `api/src/routes/jobs.ts` and `api/src/routes/cvs-create.ts` (hand-rolled session code removed, `preHandler: requireUser`).
- Decisions taken as the test-engineer assumed: canonical 401 message 'Sign in is required.'; envelope owned by server.ts; a 400 create does not consume a generation slot (slot reserved, released on non-2xx).
- Lane test: `GATE_LANE_TEST='npm -w api run test -- --run src/http src/routes tests/contract/hardening' bash framework/scripts/gate.sh`. 49/49 green across the 5 files (includes regenerate budget test; it answers 429 from the hook before the missing route would 404).
- Gate lint step is red on `api/src/core/jobs/boundaries.test.ts` and `api/src/core/jobs/jobs.test.ts` (unused `JobTestSuite`, lane 11 files). Not this lane. Lint on my files is clean; api typecheck clean.
- Docs touched: `framework/docs/architecture.md` §2.1 (rate limits, in-process caveat, session resolver, envelope owner).
- time: developer not measured.
