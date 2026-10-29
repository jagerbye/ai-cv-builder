# Lane 11 — wave B

> Lane log. Each task appends: what changed, the lane test command and its
> result, docs touched, decisions needed, `time:` per role.


## T-25 Job-queue test helper and its guard (CVB-28), test-first step

- **Changed:** tests only. `api/src/core/jobs/test-lock.test.ts` (new, helper contract), `tests/guard/job-writes.guard.test.ts` (new, grep-shaped guard plus in-memory fixtures). No production code; `test-lock.ts` untouched.
- **Helper contract the tests fix (new seam for lane 07):** `openJobTestSuite(prisma): JobTestSuite` with `enqueue(data, tx?) => Promise<jobId>` (takes the suite lock on first call), `holdsLock: boolean`, `release()` (idempotent). `acquireJobSuiteLock` export unchanged.
- **Lane test command result:** 42 pass, 12 red. Red: 7 `test-lock.test.ts` cases (`openJobTestSuite is not a function`); guard "no direct write outside helper" lists boundaries.test.ts:62,64,72,74,85, jobs.test.ts:80, tests/contract/jobs.test.ts:63; 4 "goes through the helper" cases (the four suites).
- **Not run by the lane command:** `api/vitest.config.ts` include does not match `tests/guard/**`, so the guard silently does not run in the lane gate. Verified red with a scratch config that adds `../tests/guard/**/*.test.ts`. Needs a Teamlead decision (config is outside the allowlist).
- **Docs touched:** none yet. `testing-strategy.md` mentions the helper at line 94 and is expected to match the contract above.
- **Decisions needed:** (1) add `../tests/guard/**/*.test.ts` to api/vitest.config.ts include; (2) helper shape above, since lane 07 imports it.

## T-25 implementation step (CVB-28)

- **Changed:** `api/src/core/jobs/test-lock.ts` gains `openJobTestSuite(prisma)`, `JobTestSuite` and `JobRowData`. `acquireJobSuiteLock` and `JOB_SUITE_LOCK_WAIT_MS` are unchanged. `enqueue(data, tx?)` takes the lock on first use. The helper also exposes `lock()` (additive, not in the test-engineer's contract): suites whose jobs come from HTTP call it in beforeAll so the lock wait uses the long timeout.
- **Converted to the helper:** `api/src/core/jobs/jobs.test.ts`, `api/src/core/jobs/boundaries.test.ts`, `tests/contract/jobs.test.ts` (direct creates become `suite.enqueue`, lock in beforeAll via `suite.lock()`, release in afterAll), `tests/contract/cvs-create.test.ts` (no enqueue, since jobs come from POST /api/cvs; holds the lock via `openJobTestSuite(app.prisma).lock()`).
- **Test-file edits (test-lock.test.ts, test-engineer's file):** (1) "two enqueues on one suite" now uses a second CV for the second enqueue. Two queued rows on one CV violate the ADR-004 partial index, so the old precondition was impossible. Assertion unchanged. (2) Lock-taking cases carry a 60 s timeout (`LOCK_WAIT_TIMEOUT`). Under a parallel run the real lock is held by sibling suites, and the 5 s default timed out.
- **Lane gate:** `GATE_LANE_TEST='npm -w api run test -- --run src/core/jobs tests/guard tests/contract/jobs' bash framework/scripts/gate.sh` → all green (database, lint, 40 tests in 4 files).
- **Guard:** 14/14 green under the scratch config that adds `../tests/guard/**/*.test.ts` (`/private/tmp/claude-501/-Users-mike/57b5388a-556b-4c60-b3fd-9f6d6b43757c/scratchpad/vitest.lane11.config.mjs`). The lane command still does not run it (see decision 1).
- **Docs touched:** none. testing-strategy.md line 94 already matches the helper.
- **Decisions needed:** (1) add `'../tests/guard/**/*.test.ts'` to `api/vitest.config.ts` include. Until then the guard never runs in the lane gate or the union. (2) Lane 07: `enqueue(data: JobRowData, tx?)` and `lock()` are the seam; `holdsLock` and `release()` are as the contract says.
