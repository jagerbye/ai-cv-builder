# errors.md — errors we already paid for

> **What this file is:** append-only log of non-obvious errors and their
> verified fixes. The point: an error is paid for ONCE. Agents grep this file
> by symptom keywords BEFORE debugging (the lane brief says which keywords);
> nobody reads it whole — that's why every entry starts with greppable
> symptom words.
> **Who writes it:** `/retro` moves candidates here from lane reports; an
> agent may append directly when the fix is verified.

Format — newest on top:

```
## E-NNN <symptom keywords, exact error text fragment>  (YYYY-MM-DD)
- **Context:** where it happened (component, operation).
- **Root cause:** one–two sentences, the real cause, not the first guess.
- **Fix:** what actually worked.
- **Prevention:** rule/check that makes it impossible — if it changed a rule
  file or the playbook, link it.
```

Rules: one entry per distinct root cause; a repeat of an existing entry means
its Prevention line failed — improve the prevention, don't duplicate the
entry.

---

## E-004 generation-persist case 1 fails ~1 run in 3: job failed INTERNAL "The generation failed." within ms, CV untouched  (2026-10-29)
- **Context:** tests/contract/generation-persist.test.ts. worker.ts classify() dropped the original error, so it read as a flake. With createJobWorker({ onError }) the log said PrismaClientKnownRequestError P2002, meta target Fact.id (persist.ts createMany of facts).
- **Root cause:** tests/contract/hardening-ratelimit.test.ts commits ~50 queued jobs through POST /api/cvs and never deletes them. The persist suite's runJob drained those (claimNext takes the oldest) with its fixed-fact-id pipeline; the case's own job then re-inserted the same fact ids. Whether the order of suite files left the rows before the persist suite decided red or green.
- **Fix:** persist suite's queueJob calls suite.clearOpenJobs() under the held lock (regression case added). The worker now reports error name, code, job id, attempt via onError (main.ts logs it).
- **Prevention:** a silent catch hides a reproducible bug as a flake: log class and code. Open: hardening-ratelimit should delete its users in afterAll (outside this lane's files).

## E-003 union red after a wave: a sibling lane's test pinned a temporary shape ("expected null not to be null" on a screen marker, regex on api.register(...) with no options)  (2026-10-29)
- **Context:** SPRINT-001 wave B integration. web/src/app/routes.test.tsx (T-05) required the cv route to render an h1; T-22 replaced the placeholder with the real editor, whose pending/error states rendered a bare <p>. api/src/routes/registry.test.ts (T-07) pinned `await api.register(cvsRoutes)` literally; T-28 added `{ generationPipeline }`. Both lanes were green on their own gate.
- **Root cause:** a test that encodes the current shape of another lane's file is true when written and false the moment that lane does its job. Lane gates cannot see it: the test and the subject belong to different lanes. Same class as wave A's conflict 1.
- **Fix:** the invariant is kept, the accidental part dropped. cv route: every state now renders a heading (a product defect, fixed in code, with tests). registry: the regex still demands the register call and now permits an options object (a wrong test, corrected with reviewer sign-off through the integration notes).
- **Prevention:** a cross-lane test asserts a contract (a landmark, a call, an export), never a literal shape of a file it does not own; when a conflict appears, first ask whether the code is wrong (fix the code) before touching the test. Recorded in the sprint report, wave B.

## E-002 job test flaky: "expected ... to be ..." on leasing, or "rejects a second queued job" passes; parallel suites share one queue table  (2026-10-28)
- **Context:** T-16 durable jobs. api/src/core/jobs/jobs.test.ts and boundaries.test.ts run in parallel files on one Postgres. jobs.test.ts deletes and claims every queued/running row; boundaries.test.ts committed its own queued rows.
- **Root cause:** the job queue is global by design (claimNext takes any queued row), so committed rows from another file leak in. Either side can win: a claim picks a boundary row, or a boundary insert hits a row jobs.test just deleted.
- **Fix:** the partial-index cases create their rows inside a transaction that always rolls back, so nothing is committed. Verified 8 runs in a row.
- **Prevention:** a test file that writes to a shared queue table commits no non-terminal rows, or the suite runs with fileParallelism off. Open: vitest include/fileParallelism is a Teamlead decision (outside the lane allowlist).
- **Recurrence (SPRINT-001 integration, 2026-10-28):** tests/contract/cvs-create.test.ts (T-15) commits queued jobs through the real POST /api/cvs; in the union run jobs.test.ts's reclaim worker claimed one of them ("expected <uuid> to be <uuid>" at jobs.test.ts:272). Lane gates ran the two suites separately, so only the union could show it. Fix: cvs-create now holds the job-suite lock too (fourth holder). Rule of thumb: any suite that commits a queued/running generation_jobs row takes acquireJobSuiteLock().

## E-001 union test run red while parallel lanes in flight (missing-module / foreign-suite failures)  (2026-10-23)

- **Context:** several Mode-A lanes on one tree; a lane brief told the agent
  to run the bare test command, which executes the UNION of all suites.
- **Root cause:** during parallel execution the union is red by design (a
  sibling lane's tests exist before its code). The brief, not the code, is
  defective — agents waste a step diagnosing a foreign failure.
- **Fix:** execution-phase runs are lane-scoped (run only the lane's own
  test files); the union is run only by the Integrator and the Stop-hook
  gate after lanes land.
- **Prevention:** sprint-playbook §2 brief template names the exact
  lane-scoped test command; §3 wording says "lane test run", union only in §4.

## prisma / docker / migration (T-02)
- Never redirect `prisma ... > migration.sql` with 2>&1: the "Update available" banner lands in the SQL. Set PRISMA_HIDE_UPDATE_MESSAGE=1 and check the file head.
- node:*-slim images lack OpenSSL; install openssl in the Dockerfile before `prisma generate`/`migrate deploy`.
- Compiled api is ESM without extensions: relative imports in api/src need `.js` specifiers (or NodeNext) or `node dist/main.js` fails.
- A test helper that mutates process.env must restore it; a "DB down" case leaks into later "DB up" cases and looks like a missing database.
- "Needs Docker" is not a diagnosis: start the daemon (`open -a Docker`) and run the smoke before reporting red.

## auth / errors (T-04)
- An `instanceof ApiError` check fails when the same error class is loaded twice (vitest `vi.resetModules()` plus a static import). The envelope then answers 500 for a deliberate 401 or 404, and the symptom reads as "expected 500 to be 401". Fix: match ApiError by shape (name, numeric status, enum code) as well as instanceof (http/errors.ts `isApiErrorLike`).

## toolchain pins (T-24)
- A version pin asserted in a test is a second place the version lives: an ADR that changes the pin (ADR-012, Node 22 to 24) must change the test in the same breath, or the union gate goes red on a correct change (api/src/toolchain.test.ts asserted @types/node 22.x after T-03 repinned it to 24.19.2).

## E-005 a cleanup heuristic deleted 54 rows it did not create  (2026-10-29)

- **Symptom:** after a developer agent probed the new leak guard by making a
  suite leak three users, its cleanup removed 57. The reviewer's snapshot
  caught it: the probe reported a baseline of 778 users, the reviewer read 724.
- **Cause:** the brief said "delete nothing that existed before the run", and
  the agent deleted by *heuristic* instead of by identity — every user whose
  email started with `hardening-session-` and whose row was younger than ten
  minutes. That set is not the set it created; it is the set that looks like
  what it created, and on a shared database the difference is other people's
  rows. The agent reported the overshoot itself, unprompted.
- **Fix / rule:** a test or probe deletes **by the ids it collected while
  creating**, never by a name pattern, a prefix or a time window. That is
  exactly what both hardening suites' `afterAll` now does, and the same
  discipline applies to a throwaway cleanup typed at a prompt.
- **Blast radius here:** test fixtures in a local development database; no
  product data, nothing outside this project. Recorded because the next
  database that gets this treatment may not be local.

## E-006 restart-mid-run test flaked across files  (2026-10-29)

- **Symptom:** `jobs.test.ts` "a worker that dies mid-run is replaced by a fresh one" went red now and then
  in the union run and green alone: the job row was missing or never reclaimed.
- **Cause:** two things. (1) The test slept a fixed 450 ms against a 300 ms lease, a wall-clock race that
  loses on a loaded machine. (2) Its `beforeEach` deleted EVERY queued/running `generation_jobs` row, so any
  writer that reached the table outside the suite lock removed the row mid-run, and the test read a vanished job.
- **Fix / rule:** wait on the condition (`leased_until` in the past, read from the row), never on a sleep sized
  to a lease. Cleanup of non-terminal rows is scoped to the suite's own collected user ids (E-005); a
  cleanup that needs the whole queue empty goes through `suite.clearOpenJobs()`, which takes the suite lock.
- **Prevention:** three consecutive green lane-gate runs are the acceptance bar for a timing-sensitive test.
