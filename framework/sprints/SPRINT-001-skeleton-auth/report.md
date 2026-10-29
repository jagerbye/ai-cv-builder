# Sprint NN — report

> **What this file is:** the sprint's outcome for the owner and for the next
> session. Written by the Orchestrator at close, after integration. Owner's
> language first, process details second. No commit hashes — say what
> changed; hashes live in git log.

## Shipped

<!-- Per feature, in the owner's words: what can the user/owner now do. -->

## Not shipped / returned to backlog

<!-- Item → one-line reason. Never silent rollover. -->

## Integration notes

<!-- Merge order, conflicts and how resolved, any ADRs born here. -->

**Wave A, 2026-10-28 (Integrator).** Mode A, one shared tree, no branches to
merge. Integration = removing `.wave-in-flight` and making the full union
gate (database, typecheck, lint, test, build) green. It started red with five
failing tests and one type error; it ends `gate ✓ all green` (api 426 passed /
5 skipped, web 99 passed). Three things only the union could show:

1. **Web route registry test pinned a temporary state (lane 03, T-05 vs
   T-06/T-13/T-14).** `web/src/app/routes.test.tsx` asserted that each
   feature route module "is an empty placeholder that renders nothing". That
   was true when T-05 wrote it and false by design once the three feature
   tasks filled the modules in. *Replaced, not weakened:* the four placeholder
   assertions became "resolving a <feature> path yields a component that
   renders the real <feature> screen" — each route is resolved from a concrete
   path, mounted inside a QueryClientProvider with the network stubbed
   (C-000 NOT_FOUND envelope; the only external), and must render a non-empty
   screen with its structural landmark (auth/intake: a form; generation: a
   status or alert; cv: a heading). The registry's real invariant — every
   declared route resolves to a component that renders — is now proven
   against production screens instead of stubs. All other T-05 assertions
   (one entry per feature, public/protected split, distinct paths, default
   export wiring, negative resolve cases) are unchanged.

2. **`.env.example` strictness test out of date with `WEB_PORT` (lane 01,
   T-02 vs the Orchestrator's compose change).** `api/src/db/stack-config.test.ts`
   "lists nothing else" pinned the key set to `ANTHROPIC_API_KEY, DATABASE_URL`;
   the Orchestrator added `WEB_PORT=5273` because host port 5173 is taken on
   the dev machine and compose now maps `${WEB_PORT:-5273}:5173`. *Corrected,
   not loosened:* the exact-set assertion stays exact and now includes
   `WEB_PORT`; a new assertion requires `WEB_PORT` to be a plain port number
   and `docker-compose.yml` to actually consume `${WEB_PORT…}`, so a stray or
   secret key still fails and a dangling key cannot be added silently.
   Owner-visible behaviour: the web container is reachable on
   `http://127.0.0.1:5273` by default (override with `WEB_PORT` in `.env`).

3. **Found by the union, not by any lane gate: queue-table race between T-15
   and T-16 (both lane 05).** `tests/contract/cvs-create.test.ts` commits
   `queued` generation jobs through the real `POST /api/cvs`; in the same
   parallel vitest run `api/src/core/jobs/jobs.test.ts`'s dead-worker reclaim
   test claimed one of those rows instead of its own (`expected <uuid> to be
   <uuid>` at jobs.test.ts:272). The lanes' gates ran each suite alone, so it
   never overlapped. This is the known E-002 class; fix follows its rule:
   `cvs-create` now takes `acquireJobSuiteLock()` as the fourth lock holder.
   No production code changed. Recorded as a recurrence under E-002 in
   `framework/knowledge/errors.md`.

**For the next wave:** any suite that commits a queued/running
`generation_jobs` row must hold the job-suite lock (or the Teamlead turns
`fileParallelism` off for api — still an open E-002 decision). The routes
test now mounts real screens, so a feature that adds a required provider or
mandatory prop to its route component will break the registry test on
purpose: that is the signal to update the registry contract, not the test.
No frozen contract was touched; nothing here needs an ADR unless the
Orchestrator wants the `WEB_PORT` default recorded.

**Wave B, 2026-10-29 (Integrator).** Mode A again, no branches. `.wave-in-flight`
removed; the union gate (database, typecheck, lint, test, build) started red
with three failing tests, all of the E-003 class — a test from one lane pinning
a shape another lane owned and was told to change — and ends `gate ✓ all green`
(api 532 passed / 5 skipped, web 157 passed).

1. **Web route registry vs the real cv screen (T-05 vs T-22).**
   `routes.test.tsx` requires the cv route to render an `h1`; the editor's
   pending and error states rendered a bare `<p className="cv-message">`. The
   marker is right and the screen was wrong: a user on `/cvs/<id>` with a slow
   or failed request had no title and nothing for a screen reader to land on.
   *Fixed in the code, tests first:* `web/src/features/cv/route.tsx` now renders
   every state inside the shell's `screen-message` section — pending: `<h1>Your
   CV</h1>` + `<p role="status">Loading the CV…</p>`; error: `<h1>CV
   unavailable</h1>` + `<p role="alert">{message}</p>` (same idiom as the
   generation route). The loaded state already had the CV title as its h1. Three
   assertions added to `web/src/features/cv/route.test.tsx` (pending heading +
   status; 404 and non-JSON 500 each carry the heading + alert); the dead
   `.cv-message` rule left `cv.css`. No assertion weakened.

2. **Api route registry vs cvsRoutes options (T-07 vs T-28).**
   `api/src/routes/registry.test.ts` matched `await api.register(cvsRoutes)`
   literally; T-28 injects the pipeline: `api.register(cvsRoutes, {
   generationPipeline })`. The test, not the code, was wrong: its invariant is
   "server.ts registers each plugin under /api", not "with no options".
   *Corrected, not loosened:* the regex still demands the register call and the
   import, and now permits one object-literal options argument. Integrator
   sign-off stands in for the reviewer's; recorded as E-003 in
   `framework/knowledge/errors.md` together with conflict 1.

3. **Flaky, found by the union, no lane owns it:**
   `tests/contract/generation-persist.test.ts` first case ("stores summary…")
   failed 3 of its first 7 full-suite runs and 2 of 2 file-only runs at one
   point, then passed 12 runs in a row (3 full, 9 file-only), always on the
   first test of the file. Captured on one failure: the GET answered 200 with the
   CV still `generating`/version 1, and the job row read `failed / INTERNAL /
   "The generation failed."` 17 ms after `started_at`, attempt 1, lease intact.
   So `stages()` threw a non-domain error inside the first run of the process
   and `classify()` replaced its message; `execute()` writes the failure and
   `runOnce()` returns the id as if the run had stored. Nothing logs the real
   error — not in tests, not in production (`main.ts` has no hook either). Root
   cause not established (it never reproduced with a log line in place; it is
   likely cold-start/pool-related in Prisma, not persist logic, which was read
   end to end). *Done now, in the test only:* the case asserts the response
   status, then the job row (`errorMessage` null, `status` succeeded) before
   reading the CV, so the next occurrence fails on the row with its text. *For
   a lane:* `createJobWorker` should accept a logger/`onError` so an INTERNAL
   failure is diagnosable (coding-standards: no silent catch), and `main.ts`
   should pass pino. Ownership: jobs (T-16/T-28).

**Cross-lane hazards checked in the union:**
- *Shared queue + `clearOpenJobs()`* (`generation-persist-lease`): it deletes
  every queued/running row, so it is safe only under the suite lock. Every
  suite that commits a non-terminal `generation_jobs` row holds
  `acquireJobSuiteLock()`/`openJobTestSuite().lock()`: cvs-create,
  cvs-regenerate, generation-persist(+lease,+boot), hardening-ratelimit,
  hardening-session, jobs (contract + core), boundaries, loop, test-lock.
  cvs-read, auth-register and hardening-envelope mention the paths but commit
  no job rows. The api suite ran 6 times in full today: 3 green, 3 red — every
  red the persist flake above, never a queue collision. Stable with respect to
  the lock; not stable until item 3 is understood.
- *Rate limiter reset*: the limiters are not process-global — `registerRateLimit`
  creates two `FixedWindowLimiter`s per `buildServer()` call, keyed by user id,
  and `resetRateLimits` clears that instance's. Only `cvs-create` needs it: one
  user makes ~70 writes and >10 `POST /api/cvs` per file (limits 60/min,
  10/h). Every other suite stays under both per user (max 12 writes, ≤9
  generation requests spread over per-test users), and `hardening-ratelimit`
  builds a fresh app per test with its own clock. No other suite needs the
  reset; a suite that adds a new app-wide limiter state would.

**Docs:** no user-visible contract changed (C-005/C-006 untouched);
spec §F-006 has no wording for the editor's loading/error states, which the
Teamlead may want to add ("Your CV" / "CV unavailable"). Nothing needs an ADR.

## Process signals (feeds /retro)

- Escalations: <count + where>
- Briefs that needed rework: <which, what was missing>
- Errors recorded to framework/knowledge/: <count>

## Next sprint candidates

<!-- PM's input for the next planning. -->
