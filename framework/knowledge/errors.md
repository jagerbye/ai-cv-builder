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

## E-010 green suite, broken thing — the four ways a test lies  (2026-10-29)

- **Symptoms:** QA or a user finds a defect the suite covers "already"; a test
  whose subject you cannot name in one line; a review note saying "this was
  true when written"; deleting a line of production code and the suite stays
  green; a test that passes under an error stub as happily as under a success.
- **Context:** sprint 01 shipped all four shapes past eighteen reviews.
  (1) **Asserts nothing** — "a successful run clears last week's error" stayed
  green after the null-clear was removed from `persist.ts`. (2) **Pins a
  defect** — two tests held `classify()` copying a thrown error's own message
  into the job row C-005 serves to a browser. (3) **Satisfied by the error
  path** — under a 404 stub the web route-registry check passed on the error
  state and proved nothing about the editor it was written for. (4) **Pins a
  sibling lane's temporary shape** — E-003, invisible to every lane gate.
  Separately, 691 green tests could not see that the shipped container had no
  route to the api (QA-01): nothing lies there, the seam simply has no test.
- **Fix:** the reviewer performs the mutation instead of judging it — name the
  line the test exists for, delete or invert it, require red, restore, and
  record the mutation in the fix-list. That caught (1), (2) and (3) here. For a
  test whose subject is an absence, add the forbidden thing and require red.
  (4) is caught by ownership, not mutation: across a lane boundary a test may
  assert only a contract. The seam is caught by instantiating it (gate `smoke`
  step).
- **Prevention:** `.claude/rules/testing.md` — the stub test is performed and
  recorded; a test that pins a leak is wrong and the code changes, not the
  test. Patterns P-004 (mutation), P-006 (cross-lane contract), P-003 (seam);
  reviewer step in `framework/process/sprint-playbook.md` §3.

## E-009 the same resource is fixed twice: a second lock / guard / cleanup rule / "remember to" over one shared thing  (2026-10-29)

- **Symptoms (any of these, on a thing more than one process touches):**
  "expected <uuid> to be <uuid>" claiming another suite's row; P2002 unique
  violation on fixed fixture ids; `runOnce()` returned null; rows that were
  there a moment ago; a test green alone and red in the union; a cleanup that
  deleted more than it made; "passes 9 runs in 10".
- **Contended resource (the index — grep this phrase before adding a lock or a
  cleanup rule):**
  - `generation_jobs` queue → E-002 (advisory suite lock), E-004 (leak guard +
    `clearOpenJobs()` under the lock), E-006 (wait on the condition, scope the
    cleanup), E-008 (one gate run at a time per database).
  - `ai_cv_builder` database (suite ↔ running app ↔ second gate run) → E-002,
    E-004, E-005, E-008. **Resolved by splitting it: ADR-019.**
  - host port 5173 → `WEB_PORT`, sprint report wave A item 2.
  - `api/src/server.ts` and the cross-lane interfaces → ADR-011's bootstrap
    task T-07; owned by exactly one lane per wave.
- **Root cause of the pattern:** each occurrence arrives with a different
  symptom, in a different lane, to a different agent, and each gets a correct
  local fix — a lock, a guard, a rule. The root-cause line everyone writes is
  the local one and it is true, so nothing ever compares two of them. errors.md
  is grepped by symptom by design (nobody reads it whole), and these symptoms
  have no words in common. Four entries and a day lost to a "flake" before
  anyone named the resource: the suite shared a database with the app.
- **Fix:** split the resource instead of adding a fourth mechanism over it —
  the suite got its own database (ADR-019); the lock, the leak guard and the
  delete-by-id rule stay, because they are still right when two suites run in
  parallel, but they stopped being the only thing between a test run and a
  developer clicking through the app.
- **Prevention:** every entry whose fix adds or tightens a coordination
  mechanism names its **contended resource** on one line, and that line is
  grepped before the fix is written. A second hit on the same resource is not a
  third entry — it is an isolation decision, and it goes to an ADR.
  Pattern: `framework/knowledge/patterns.md` P-002; retro step added to
  `framework/process/sprint-playbook.md` §5.

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

## E-007 a QA fixture outlived the contract it encoded  (2026-10-29)

- **Symptom:** the re-QA pass reported QA-05 as not fixed — "the API still
  emits bare paths `skills[5]`, `summary`" — on a day the verifier had been
  changed to field-level paths and twelve exact-string tests proved it.
- **Cause:** the CV under test came from `scripts/seed-qa.ts`, which writes its
  questions by hand with the pre-ADR-016 spellings. The API was returning
  exactly what was stored. The fixture was the only thing left in the repo
  still speaking the old grammar, and because QA drives real stored data, the
  fixture's dialect looked like the API's.
- **Fix / rule:** fixture data that encodes a contract is a second source of
  truth and will drift. Generate it through the production code path — the
  seed already borrows `itemsFromDraft` from `persist.ts` for items, and the
  questions should likewise come from `verify()` rather than from a literal.
  Where a literal is unavoidable, assert it against the contract in a test.
- **Worth keeping:** the UI degraded honestly rather than crashing — an
  unresolvable path parks the card after the sheet with a generic eyebrow.
  That fallback is what turned a contract drift into a visible oddity instead
  of a blank screen.

## E-008 "runOnce returned null" — two gate runs on one machine  (2026-10-29)

- **Symptom:** after ADR-019 gave the suite its own database, a full-gate run
  still failed five tests at once, all with `runOnce()` returning null, all in
  suites that correctly take the job-suite lock. Nine other runs were green.
- **Cause:** two gate runs were executing at the same time — one lane running
  its own tests while another ran the gate in a loop, both against
  `ai_cv_builder_test`. The advisory lock serialises job SUITES; it does not
  serialise two whole test RUNS, and the second run's worker claims the first
  run's queued row the moment the first releases the lock between suites.
- **Fix / rule:** one gate run at a time per database. Ten consecutive serial
  runs on a quiet machine passed 10/10 after the fix, against 9/10 and 5/7
  while two runs overlapped. If parallel runs are ever needed, they need a
  database each, not a lock each — the same conclusion ADR-019 reached one
  level up.
- **Worth keeping:** every earlier "flake" in this project turned out to have a
  mechanical cause (E-002, E-004, E-006, E-007). None was randomness. The cost
  of calling one of them a flake was a day; the cost of chasing each was an
  hour.

## E-011 first live run: a CV with no jobs, no degree, no contact and no summary  (2026-10-29)

- **Symptom:** the first end-to-end run on a real model returned a CV with zero
  experience, zero education, no contact block and no summary, from a source that
  plainly stated two jobs, a degree, a name, an email, a phone and a city. Nothing
  threw; every stage reported success. The question it raised was right ("What
  were the exact dates of this role?") and the entry it asked about had been deleted.
- **Cause:** four independent gaps that only a real model exposed. (1) The verifier
  demanded that the drafted period be a substring of the cited fact, and the model
  writes `2019 - Present` where the source says `Since 2019`: every reformatted date
  deleted its whole job. (2) `compose` never produced a contact block at all.
  (3) A summary that failed was dropped. (4) The model derived "5+ years" from dates.
  The fixtures had been written in the verifier's own dialect, so no test could meet
  any of these.
- **Fix / rule (ADR-022):** drop only what is a lie, ask about what is merely
  unconfirmed. An invented entity (organisation, figure, technology) is a lie and is
  dropped; a reformatted date or a woolly phrase is not, and is kept with a question.
  A rule that deletes data must be tested against the OUTPUT OF A REAL MODEL, not a
  fixture written by the author of the rule: record one live run's output as a golden
  fixture the day it exists. Review found three follow-ons: the fix let an invented
  employer survive in the summary (Amendment A), the new contact block was never
  stored (a producer and its persister must land in one change), and one fact
  naming two employers hides a mis-pairing (fixed at extract, one fact per employer).
- **Worth keeping:** "every stage succeeded" proves nothing about content. A
  zero-item result from a non-empty source is itself a signal worth asserting.

## E-012 a test used a word as a proxy for a sentence, and a new element said the same word  (2026-10-29)

- **Symptom:** adding a progress stepper to the generation view broke eight
  tests that had been green and correct for weeks. `findByText(/extracting/i)`
  began matching two nodes.
- **Cause:** those queries meant "the status sentence names this stage and no
  other", and they expressed it by searching the whole screen for the stage's
  NAME. That held only while exactly one element on the page ever said the word.
  The stepper names all four stages on purpose — that is its entire job — so
  the proxy stopped standing for the thing it proxied.
- **Fix / rule:** a query asserts the thing itself, not a token that currently
  happens to be unique. The eight now match the sentence copy
  (`/composing the draft/i`), which is what they were always about. No
  assertion was removed or weakened, and the reviewer signed the correction off
  as the testing rule requires.
- **Worth noticing:** nothing was wrong with the old tests when they were
  written. They encoded an assumption about the rest of the page that no one
  stated, and a feature that was supposed to be additive broke them. A test
  that reaches outside its subject to identify its subject will be broken by
  work that has nothing to do with it.

## E-013 docs-sync degrades exactly when work is split into narrow lanes  (2026-10-29)

- **Symptom:** an audit after a day of parallel work found the architecture
  document describing a verifier that had been deliberately replaced, the spec
  stating a grounding rule two ADRs had superseded, a question priority the
  code no longer used, and no gateway section at all — while every individual
  lane had passed review with "docs touched" satisfied.
- **Cause, and it is structural rather than careless:** a lane is given a
  narrow allowlist so it cannot collide with its neighbours. The central
  documents — the specification, the architecture — belong to no lane and are
  on nobody's allowlist, so a change to behaviour updates the ADR (which the
  Orchestrator writes) and the lane's own corner, and the document a reader
  actually starts from drifts. The more lanes, the faster it drifts. Each lane
  was individually correct.
- **Fix / rule:** a wave ends with a docs audit that reads the central
  documents against the ADRs written during it, and the audit's output is "what
  the doc currently claims" before "what I changed" — stating the claim first
  is what surfaces a sentence that is confidently wrong rather than merely
  missing.
- **Worth noticing:** the dangerous entries were not the gaps. A missing
  paragraph is visibly missing. A paragraph describing last month's rule reads
  as authoritative, and the next agent builds on it.
