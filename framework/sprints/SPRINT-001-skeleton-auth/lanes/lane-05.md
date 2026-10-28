inserted
# Lane 05 — intake and durable jobs

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

## T-15 Intake: a PDF or free text becomes an immutable source
- tests (test-engineer): api/src/core/intake/intake.test.ts (17 unit, imports ./intake.js exporting extractSource + IntakeError); tests/contract/cvs-create.test.ts (20 contract, real buildServer + Postgres, session row inserted directly per ADR-007). RED confirmed: contract = 20 assertion failures, e.g. "expected 404 to be 201" (cvs-create.ts is an empty plugin); unit = suite-level "Cannot find module './intake.js'" (missing module, not an assertion). Criteria mapping: C-003 both/neither/targetRole/sourceText bounds 199/200/50000/50001 and verbatim persistence; C-004 size 10 MB+1 to 413 and 9 MB accepted, magic bytes, 20/21 pages, scan (0 chars and 50 chars), no-targetRole to 400; distinct messages; state generating, queued job, binary not retained; 2 s timing. Not covered (not in T-15 brief): 401 without session, 429, ownership.
- lane command gap: `npm -w api run test -- --run src/core/intake tests/contract/cvs-create` runs only the unit file. vitest include is src/**/*.test.ts relative to api/, so tests/contract is never collected ("No test files found" when run alone). Contract suite was run via a scratch config outside the repo. Needs a Teamlead decision (same as T-03).
- code (developer): pending
- review (code-reviewer): pending
- escalations: none
- errors worth remembering: none
- docs touched: none
- time: tests ~0:20, code pending, review pending
- jira: CVB-7 — sync pending

## T-15 Intake (developer block, appended after the test block above)
- code (developer): api/src/core/intake/intake.ts (extractSource, IntakeError, size/magic/pages/scan rules, pdf-parse 2.4.5 getText), api/src/core/intake/persist.ts (createCvFromSource: cv in state generating + generation_jobs row queued, one transaction, no LLM), api/src/routes/cvs-create.ts (POST /cvs JSON path, targetRole 1..120, both/neither → 400, 401 without session). Session lookup is a local temporary helper (sha256 hex of cookie `sid`, ADR-007); auth lane should replace it.
- GREEN so far: unit suite 15/17; contract JSON path 9/20 (all JSON-side cases pass, including the 2 s JSON timing and verbatim persistence).
- NOT DONE, needs a Teamlead decision: C-004 multipart. Fastify 5 has no multipart parser here (no @fastify/multipart in node_modules, not in architecture.md dependency budget), so multipart requests answer 415. 11 contract cases fail on this. Options: approve a dependency (@fastify/multipart, with a risk note) or approve a hand-written bounded parser. I did not add either.
- FIXTURE DEFECT (test file, needs test-engineer fix + reviewer sign-off; I did not edit tests): tests/… and intake.test.ts buildPdf writes each line at x=72 with no wrapping. pdf-parse/pdf.js drops glyphs past the page edge, so a 300-char line yields about 115 chars (reproduced in scratch). 2 unit tests fail for this reason: "does not return the binary" and "accepts a 9 MB PDF". Fix: wrap lines to about 85 chars in buildPdf, or use a shorter line.
- Lane command gap (unchanged from the test block): the command does not collect tests/contract. I ran the contract suite with a scratch config outside the repo.
- gate.sh: RED, not from this lane's code. Typecheck fails on generation tests (questions.js, verify.js missing), web routes.test.tsx; test fails on stack-config.test.ts and the two intake fixture tests above; lint and build step output show no intake errors. intake and cvs-create files have 0 typecheck errors.
- errors worth remembering: pdf-parse clips text past the page edge (MediaBox). Long lines in a fixture PDF silently lose text, so a "scan" verdict can be a false positive. Wrap test PDF lines.
- docs touched: none (C-003/C-004 match the built JSON behavior; the multipart part is still unbuilt)
- jira: CVB-7 — sync pending

## T-15 Intake (second developer pass: diagnosis)
- diagnosis: the first attempt stopped correctly on the multipart question but misfiled two things. (1) Fixture defect was real and is now fixed: pdf-parse 2.4.5 clips glyphs past the MediaBox (300-char line -> 102 chars; same line on a 5000pt page -> 316). Production PDFs wrap, so intake.ts is right and needs no change. Fixed in buildPdf in api/src/core/intake/intake.test.ts by wrapping lines at 85 chars; no assertion touched. Needs code-reviewer sign-off because it is a test file edit. Unit: 17/17.
- BRIEF DEFECT (not fixable by a developer): the allowlist and the architecture.md dependency budget cannot deliver C-004. Fastify 5 has no multipart parser; @fastify/multipart is absent and unlisted. Same class as ADR-010 (budget omitted something a contract needs). Teamlead must either approve @fastify/multipart (preferred: bounded size via limits.fileSize 10 MB, files:1; add the row to architecture.md) or approve a hand parser. formidable is in node_modules only transitively via supertest (dev) and must not be used. Until then multipart answers 415 and 11 contract cases stay red. Nothing was added.
- brief defect 2: lane command never collects tests/contract (vitest include is src/**/*.test.ts), so the lane's own acceptance tests are not in its gate. Fix is a vitest include change outside this lane's allowlist.
- session lookup helper in cvs-create.ts remains temporary (sha256 hex of cookie sid, ADR-007); the auth lane replaces it.
- gate.sh still RED, none of it from lane 05: generation tests import ./questions.js and ./verify.js that do not exist yet (lane 04 in flight); stack-config.test.ts ".env.example lists nothing else" (3 keys found, WEB_PORT unexpected); web routes.test.tsx(70) TS18048. Lint and build pass.

## T-15 Intake (code-reviewer verdict, CVB-7)
- review (code-reviewer): fix-list, NOT approved. ok=false. T-15 stays blocked.
- criteria: JSON path (C-003) reviewed and sound: 199/200/50000/50001 bounds, targetRole 1..120, verbatim persistence, state generating + queued job in one transaction, no LLM call, no import from core/generation. Error cases present per criterion, so the JSON side is not a stub suite.
- C-004 multipart: NOT built. Contract run: 9 pass, 11 fail, all "expected 415". Blocking. Needs a Teamlead decision on @fastify/multipart (not in node_modules/@fastify, not in architecture.md; grep finds no multipart row) or a bounded hand parser. Approve, then add the architecture.md row and a one-line risk note in the lane report.
- fixture edit in intake.test.ts (buildPdf wraps lines at 85 chars): signed off. Production intake.ts is untouched, and the wrap only restores what a real PDF would have. Unit 17/17 green on rerun.
- lane command gap: confirmed. `npm -w api run test -- --run src/core/intake tests/contract/cvs-create` collects only the unit file. Contract suite runs only through a config outside the repo (scratchpad). Teamlead must approve a vitest include change (outside this allowlist).
- check-lane.sh ee63f25 with the T-15 allowlist: lane 05 files are clean. Violations are other lanes' work in the shared tree: tracked files cvs.ts, auth.ts, architecture.md, web/index.html, web/src/main.ts, check-lane.sh, board.md, backlog.md, STATE.md, and lane-02..07 logs. Integrator must check per lane, not on the shared tree.
- gate.sh (run by reviewer): RED. typecheck: web routes.test.tsx(70) TS18048. test: stack-config.test.ts ".env.example lists nothing else", verify.golden.test.ts x2. None from lane 05 files. Intake unit and cvs-create JSON are green.
- stub-test lens: JSON-side assertions check concrete values (exact uuids, verbatim text, boundary lengths). Nothing would pass by returning a constant. The multipart cases cannot be judged until they run.
- fix-list to clear T-15: (1) Teamlead approves multipart parser and the dependency row; (2) build C-004 in cvs-create.ts or a core/intake helper, keep 10 MB / 20 pages / magic / scan rules as in intake.ts; (3) Teamlead approves vitest include for tests/contract; (4) replace the temporary sha256 session helper with the auth lane's resolver when it lands; (5) re-run the contract suite: 20/20 green.
- errors worth remembering: pdf-parse 2.4.5 clips glyphs past the MediaBox; wrap fixture lines (already in errors-worthy note above).
- docs touched: none. Plan row T-15 kept at blocked, reason updated to match this verdict.

## T-15 Intake (third developer pass: fix-list, still blocked)
- No code changed. Fix-list items 1 and 3 are Teamlead approvals (multipart parser plus architecture.md dependency row; vitest include for tests/contract). Neither is recorded anywhere (architecture.md, board, decisions, lane logs checked). vitest.config.ts and architecture.md are outside the T-15 allowlist and @fastify/multipart is not installed, so I did not add a dependency, edit the config, or pick the hand-parser option on my own authority.
- Item 4: no session resolver has landed (api/src/core/auth has only password.ts and register.ts), so the temporary sha256 helper in cvs-create.ts stays.
- Item 2 (C-004) is blocked by item 1. Once the parser is approved it is a small change in cvs-create.ts plus a core/intake helper that reuses extractSource rules. 11 contract cases still 415.
- gate.sh re-run: RED, test step fails; build passes. Not from lane 05 files.
- docs touched: none

## T-15 Intake (code-reviewer re-review after third developer pass, CVB-7)
- review (code-reviewer): fix-list, NOT approved. ok=false. T-15 stays blocked.
- checked item by item against the previous fix-list:
  1. Multipart parser approval and architecture.md row: NOT DONE. No approval in framework/docs (architecture, decisions, api-contracts), board.md, plan.md or lane logs. @fastify/multipart absent from api/node_modules and root node_modules, and from api/package.json. Teamlead decision still needed.
  2. Build C-004: NOT DONE, blocked by item 1. cvs-create.ts still returns 415 on multipart.
  3. Vitest include for tests/contract: NOT DONE. api/vitest.config.ts still has include ['src/**/*.test.ts'], so the lane command never collects the contract suite. Teamlead decision needed.
  4. Session helper: NOT DONE, correctly deferred. sha256 helper in cvs-create.ts stays until the auth resolver lands.
  5. Contract 20/20: NOT MET. Re-run via a plain scratch config outside the repo: 9 passed, 11 failed. All 11 failures are "expected 415 to be ..." (multipart), plus the matching timing case.
- unit suite: src/core/intake/intake.test.ts 17/17 green (the buildPdf wrap fix stays signed off).
- check-lane.sh ee63f25 with the T-15 allowlist (api/src/core/intake/**, api/src/routes/cvs-create.ts, tests/contract/cvs-create.test.ts, lane-05.md, plan.md): no violation names a T-15 file. The script exits 1 only because of other lanes' files in the shared tree (generation, core/cv, core/auth, http, llm, web, lane-02..07, board.md, STATE.md, check-lane.sh, tests/contract/auth-register.test.ts, cvs-read.test.ts, tests/fixtures). Lane 05 is clean; the Integrator must check per lane.
- gate.sh re-run from repo root: RED. typecheck: core/cv/merge.test.ts (missing ./merge.js, implicit any), web routes.test.tsx(70) TS18048. test: verify.golden.test.ts 2 failed, stack-config.test.ts (.env.example WEB_PORT). Build step reached. No failure in a lane 05 file.
- stub-test lens: JSON-side cases assert exact values (uuid shape, verbatim text with whitespace and non-ASCII, 199/200/50000/50001 boundaries, 400 envelope). A constant return would fail them. The 11 multipart cases cannot be judged until they run.
- fix-list to clear T-15 (unchanged, in order):
  (a) Teamlead approves @fastify/multipart (limits fileSize 10 MB, files 1) and adds its architecture.md dependency row with the one-line risk note, OR approves a bounded hand parser in writing.
  (b) Teamlead approves the vitest include change: add '../tests/contract/**/*.test.ts' to api/vitest.config.ts (also unblocks T-03 and lane 03).
  (c) Re-dispatch T-15 for C-004 only: multipart handler in cvs-create.ts, PDF rules reused from intake.ts, no change to the JSON path.
  (d) Swap the temporary sha256 session helper for the auth resolver when it lands (follow-up, not a blocker for the C-004 work).
  (e) Re-run the contract suite: 20/20 green through the repo command.
- errors worth remembering: none new (pdf-parse MediaBox clipping already noted above).
- docs touched: none
- escalations: none
- jira: CVB-7 — sync pending

## T-16 Durable jobs (test-engineer block, CVB-8)
- tests (test-engineer): api/src/core/jobs/jobs.test.ts (23 cases, real Postgres, fake GenerationPipeline), api/src/core/jobs/boundaries.test.ts (6 cases), tests/contract/jobs.test.ts (8 cases, real buildServer + Postgres). RED confirmed: see below.
- RED, by kind:
  - jobs.test.ts: MISSING MODULE, suite-level: "Cannot find module './worker.js'". No assertion has run yet. Expected until the developer creates api/src/core/jobs/worker.ts.
  - boundaries.test.ts: 5 pass, 1 fails on assertion: "expected 0 to be greater than 0" (empty api/src/core/jobs dir, guard against an empty pass). The 5 passes are real: partial unique index (C-010 409 basis) already exists in the init migration; seam guard (only ../generation/types.js imported, no bullmq/ioredis) passes on an empty dir, which is why the non-empty guard is there.
  - tests/contract/jobs.test.ts: ASSERTION RED. 6 fail with "expected 404 to be 200" / "expected undefined to be 'running'" (jobs.ts is an empty plugin, so every GET is 404). 2 pass: "unknown id -> 404 NOT_FOUND" and "another user's job -> 404 identical to unknown". Those two pass WITHOUT any implementation (an unrouted path is a 404). They are a weak signal; treat them as guards, not progress. Reviewer should check they stay meaningful once the route exists.
- Module API the tests assume (developer must match, or the brief changes): `createJobWorker({ prisma, pipeline, workerId, leaseMs, budgetMs? })` returns `{ claimNext(), runOnce(), stop() }`; `JOB_BUDGET_MS = 180_000` exported from worker.ts. claimNext leases via FOR UPDATE SKIP LOCKED, increments attempt, sets leased_until. An expired lease at attempt >= 2 is failed (attempt becomes 3), never run. stop() ends lease renewal (used to simulate a dead worker). Stage written before extract ('extracting') and compose ('composing'). Error code: a thrown error's `code` if present, else INTERNAL. The message never contains a stack.
- Criteria -> tests: SKIP LOCKED (two concurrent claims get distinct jobs; a row locked by another tx is skipped, not waited on); lease renewal (leasedUntil in the future mid-run past the original lease); live lease not reclaimed; dead-worker reclaim (expired running attempt 1 -> attempt 2, succeeded); attempt > 2 -> failed, pipeline not called; restart mid-run (worker A stalls then stop(); B reclaims and succeeds; A's late finish cannot overwrite the terminal row); budget 180 s -> JOB_TIMEOUT and late pipeline answer does not revive it; terminal immutability (second runOnce returns null, row unchanged); classified error (LLM_UNAVAILABLE kept, plain error -> INTERNAL, no stack); seam (no core/generation import except types.js; no broker deps); partial unique index (P2002 on second in-flight row; freed on succeeded/failed); GET shape per status; exact field set; 404 for unknown and other user's, identical bodies; owner still sees own job.
- Not covered (outside T-16 brief, or no criterion): success path does not persist CV content or questions (core/cv / generation writes that); 401 without session (not in C-005 wording).
- Test env notes for the developer: (1) jobs.test.ts and boundaries.test.ts call prisma.generationJob.deleteMany on queued/running rows in beforeEach. Do not run them in parallel with tests/contract/jobs.test.ts against the same DB. (2) The lane command does not collect tests/contract (vitest include is src/**/*.test.ts), so the contract file only runs through a scratch config (same gap as T-15). Ran via scratchpad config at /private/tmp/claude-501/-Users-mike/57b5388a-556b-4c60-b3fd-9f6d6b43757c/scratchpad/vitest.contract.mjs.
- Lane command result (npm -w api run test -- --run src/core/jobs tests/contract/jobs): Test Files 2 failed (the unit module-missing file and boundaries.test.ts), Tests 1 failed | 5 passed. Contract via scratch config: Tests 6 failed | 2 passed.
- code (developer): api/src/core/jobs/worker.ts (createJobWorker: claimNext via FOR UPDATE SKIP LOCKED with attempt+1, attempt > 2 fails the row, fenced writes on id+attempt+status='running', lease renewal every leaseMs/3, budget from startedAt with JOB_TIMEOUT, JOB_BUDGET_MS=180000), api/src/core/jobs/read.ts (C-005 shape), api/src/routes/jobs.ts (GET /api/jobs/:jobId, 401 without session, 404 for unknown or foreign, sha256 session helper copied from cvs-create.ts until auth lands). Imports only ../generation/types.js and ../../http/errors.js.
- decisions taken, flag to Orchestrator: (1) reclaim past MAX attempts fails with INTERNAL and the fixed message "The generation was interrupted and no attempts remain."; (2) classified codes accepted only if in the C-000 enum, known-code messages pass through, all else INTERNAL with a fixed message; (3) budget counts from the first claim's startedAt, so a reclaim gets only the remaining budget; (4) stop() abandons in-flight runs without writing (a dead process writes nothing).
- test fix (inside allowed dir, no assertion weakened): boundaries.test.ts partial-index cases now run inside a rolled-back transaction. Committed queued rows there leaked into jobs.test.ts both ways (claim picked them, and jobs beforeEach deleted them under the insert). Recorded as E-002.
- gates: lane command 24/24 green (8 runs). Contract jobs 8/8 green via scratch config. typecheck api clean. api lint: 3 errors, all in other lanes (generation/compose.test.ts, routes/cvs.ts), none in T-16 files. gate.sh RED, only other lanes' steps (web routes.test.tsx TS18048, stack-config .env.example, verify.golden x2, lint above).
- docs touched: none. architecture.md 2.5 already states the design; no interface or schema change.
- gaps left open (not mine to decide): (a) the in-process loop is not started anywhere; main.ts is outside this allowlist and the pipeline is lane 04's. runOnce() is ready for it. (b) verify() output is not persisted and cv.state is not moved to ready or failed on a job's terminal write; both are core/cv's job per the brief, but nothing owns the failed-CV transition yet. (c) contract and unit suites share the DB; the lane command does not collect tests/contract (vitest include src/**), so the contract suite runs only through the scratch config.
- check-lane (ee63f25, T-16 allowlist): no violation names a T-16 file; the 93 violations are other lanes' shared-tree changes.
- gates (code-reviewer re-run): gate.sh RED. Typecheck: only web routes.test.tsx(70) TS18048. Test: 6 failed, of which 3 are T-16 (jobs.test.ts: 180 s budget x2 "job ... not found" and terminal immutability "expected 'running' to be 'succeeded'"); the other 3 are other lanes (stack-config .env.example; verify.golden x2). Lint: other lanes. The T-16 failures are intermittent: the lane command passed 3 of 3 runs alone, but the full api unit run failed the same jobs cases in 2 of 5 runs (gate run and a later run), and a full run with tests/contract collected also failed one jobs case.
- check-lane (code-reviewer, ee63f25, T-16 allowlist via file): 93 violations, none names a T-16 file. Tracked changes outside the allowlist are other lanes only.
- stub-test lens: pass. Budget, reclaim, restart and terminal-immutability cases assert concrete rows and call counts, and the 404 cases now fail without the route. A hard-coded happy value would fail them.
- review (code-reviewer): ok=false, T-16 NOT accepted. Blocking fix-list:
  (1) jobs.test.ts is not isolated from other DB writers. claimNext is global by design (oldest queued or expired row in the whole table), and jobs.test.ts beforeEach deletes every queued/running row. Committed queued rows from other suites (contract cvs-create/cvs-read and intake persist) leak in. Fix inside the allowlist: take a Postgres advisory lock (pg_advisory_lock on a fixed key) in beforeAll and release it in afterAll for jobs.test.ts, boundaries.test.ts and tests/contract/jobs.test.ts, so the job suites run one at a time. The alternative is fileParallelism off, which is a Teamlead config decision.
  (2) Re-run gate.sh three times in a row; the T-16 cases must be green all three. Gate may stay red only on other lanes' steps.
  (3) worker.ts: after stop(), runOnce() and claimNext() must return null. Today a stopped worker can still claim a row, which the process-death model says it must not.
- open gaps (not blocking T-16, for the Orchestrator): the in-process loop is not started anywhere (main.ts outside the allowlist); verify() output is not persisted; cv.state is not moved to ready or failed on a job's terminal write; the vitest include for tests/contract is now changed in the shared tree, so the contract suite is collected by the api run.
- plan row T-16: the developer flipped it green. Reset it to in progress until fix-list (1) to (3) are done.
- docs touched: none (reviewed; architecture 2.5 already describes the design)
- escalations: none
- errors worth remembering: none new. (BSD sed needs `sed -i ''`.) Env: the server's env validation needs DATABASE_URL at import, so contract files must set it before the dynamic import of server.js.
- docs touched: none
- time: tests ~0:40, code ~0:30, review done (ok=false)
- jira: CVB-8 — sync pending
