# Sprint 001 — report

> **What this file is:** the sprint's outcome for the owner and for the next
> session. Written by the Orchestrator at close, after integration. Owner's
> language first, process details second. No commit hashes — say what
> changed; hashes live in git log.

- **Sprint:** SPRINT-001 — "skeleton and auth", re-planned into the whole
  product. 2026-10-28 → 2026-10-29. · **Waves:** 0, A, B, then QA stage 4.5 and
  three rounds of fixes. · **Board:** `framework/sprints/board.md` (CVB).
- **Written by the PM at close.** Everything with a number in it was re-checked
  against the tree on 2026-10-29; nothing here is copied forward from a status
  line.

## Shipped

Capability, not task ids. Everything below was exercised through a browser
against the composed stack (`docker compose up`, web `127.0.0.1:5273`) during
the QA passes of 2026-10-29, except where marked.

A person can, today:

- **Have an account.** Register, sign in, sign out, stay signed in across a
  reload. Passwords are argon2id from the Node 24 standard library (ADR-012);
  the session is a cookie, not a JWT (ADR-007). Opening `/` sends them to
  sign-in or to their CV list depending on the session, and signing in from a
  deep link returns them to the page they asked for.
- **Give the product a source.** `/cvs/new` takes pasted text or a PDF upload
  plus a target role; it rejects an empty body, a non-PDF and a too-short text
  with the reason; it stores the extracted text and discards the binary.
- **Watch the work.** Intake queues a job, a worker inside the api process
  claims it (`SELECT … FOR UPDATE SKIP LOCKED`, ADR-004), renews its lease and
  reclaims what a dead worker left; the progress screen polls and survives a
  reload (ADR-003), and a crash no longer strands a CV in `generating`.
- **See their CVs.** `/cvs` lists title, target role, state and last-updated,
  each row opening the editor.
- **Edit a CV.** Every generator-written field is editable in place; entries,
  bullets and skills can be added, deleted and reordered; a save carries the
  version it read, a stale save gets 409 with the user's typed text kept, and a
  field the user touched is marked `userEdited` and survives a regeneration.
- **Read a question beside the field it asks about.** Desktop puts each card
  level with its field, mobile directly under it, 3 of 3 on the seeded CV at
  both viewports. This is the product's one visual idea and it works.
- **Be told why something failed.** A CV whose generation fails reaches state
  `failed` and carries `lastError: { code, message }` (ADR-017); a missing or
  wrong API key gets its own code instead of collapsing to `INTERNAL`
  (ADR-018), so a configuration problem does not read as a bug in the product.

Built, tested and never actually used: `POST /api/cvs/:id/questions/:qid/answer`,
`POST /api/cvs/:id/regenerate`, `GET /api/cvs/:id/pdf`. Each terminates either
in the LLM or in a generated draft.

**What a person cannot do is get a CV out of it.** No `ANTHROPIC_API_KEY` has
ever been set in this repo. Extract, compose and verify have run only against
fixtures; every real generation ends `CONFIG_MISSING`. The thing the product
exists for is thoroughly tested and has never been performed.

## Not shipped / returned to backlog

| Item | Why |
|---|---|
| A real end-to-end generation | No API key, by the owner's choice. Every stage is unit- and contract-tested against fixtures and golden adversarial cases; the chain has never been run against Anthropic. Until it is, the groundedness guarantee is proven about our code, not about the model's output. |
| PDF of a generated CV | The export endpoint exists and is tested (A4, real text layer, C-011/ADR-005) against seeded data. No generated draft exists to export, so the end-to-end path is unverified. |
| The five container tests | `tests/contract/auth-session-container.test.ts` runs only with `CONTAINER_API_URL` set and is skipped otherwise — deliberately, so a host-side gate cannot claim container evidence it does not have. It currently reports `5 skipped` on every run, which means nothing in the gate proves the built image's session flow. |
| B-021 SSE progress | ADR-003 keeps polling as the source of truth; this is latency polish. |
| B-022 source-quote popover | C-006 already exposes the data; only the UI is missing. |
| B-023 session expiry sweep | Irrelevant without a deployment. |
| B-024 framework harvest | Open on purpose: the FF-01…FF-15 findings are applied to the template once, at project end, in a single pass (owner's decision 2026-10-28). Every proven fix is already live in this repo's copy. |
| Not checked by anyone | Keyboard-only and screen-reader passes, measured colour contrast, 768×1024, sign-up through the UI, the PDF happy path, the delete-confirm flow. QA names these as out of its scope; nothing else covers them. |

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

## What it cost

**Wall clock.** 46 commits, 2026-10-28 21:14 → 2026-10-29 11:13, in two
blocks: 1h49m on the 28th and 3h07m on the 29th — **4h56m of active wall
clock**. Phase boundaries read off the commit timestamps:

| Phase | Window | Elapsed |
|---|---|---|
| Planning, two re-plans, design tokens, foundation (wave 0) | 21:14–22:01 | 0:47 |
| Wave A — six lanes, 15 tasks, reviews, integration | 22:01–23:03 | 1:02 |
| Wave B — plan, five lanes + one unplanned, integration | 08:06–09:29 | 1:23 |
| QA stage 4.5 and three rounds of fixes | 09:29–11:13 | 1:44 |

**The QA stage and its fixes cost more wall clock than either wave of feature
work.** That is the most useful number in this report, and it is the direct
price of the blind spot described below.

**Scope.** 26 lane tasks across three waves (3 + 15 + 8), two tasks outside the
lanes (design tokens; a toolchain-pin correction forced by ADR-012), and seven
QA-fix issues in five more lanes. Wave B was planned as seven tasks and ran as
eight: CVB-31 is scope nobody wrote down — `core/jobs/worker.ts` ran the whole
pipeline and then wrote only the job row, its own comment claiming "the
verified result is persisted by core/cv", where no such write existed, and
nothing started the worker at all. It surfaced only because T-26's regenerate
test asserted the old employer was gone after a run, and it was not.

**Review and escalation.** The lane logs record **66 review passes** over 26
tasks. The distribution is the signal: lane 06 (CV API and export) logged 12,
lanes 01/02/03/04 logged 10 each, and lanes 09–12 and A–E logged none at all —
not because those tasks were reviewed less, but because the later lane logs
stop being written (see Process signals). T-01, the repo scaffold, needed
**five rounds** before approval, every one of them about the toolchain being
declared but not installed. Nine lane reports escalate rather than decide. Two
of those escalations were correct and expensive — argon2 on Node 22 (ADR-012)
and the recombination hole in the verifier (ADR-013) — and both would have
shipped a defect if the agent had guessed instead of stopping. Two others the
lane logs themselves mark as avoidable (the defects were inside the task's own
test files), and three are not capability gaps at all but brief defects: an
allowlist that contradicted its own acceptance criteria.

**Estimates against reality.** The board carries **58.5 h** of estimates for
the 26 tasks that have one. The work took ~5 h of wall clock with six lanes
running at once, so those two numbers are not comparable — and the lane logs do
not let you make them comparable. Of 26 tasks, only nine carry a `time:` line
with real figures; four lane files still hold the unfilled template `~h:mm`;
lanes 09, 10, 11, 12 and A–E record no time at all. Where a figure does exist
it is a fraction of its estimate: T-01 ~0:35 against 2 h, T-12's test phase
~0:40 against 3 h, the design task **0:05 against 1 h**. The board's worklog
column was filled exactly once, for that design task.

**So: this sprint produced no usable velocity data.** Treat the estimates as
ordering information and nothing more. If the next sprint wants hours, the
`time:` line has to be enforced the way the gate is enforced — by a check, not
by a template.

## What went wrong, and what it cost

### The one that matters: a fully green gate shipped a product nobody could open

At the end of wave B the gate was green on three consecutive full runs — 534
api tests, 157 web tests, typecheck, lint, build. The first QA pass could not
sign in. `web/vite.config.ts` declared no proxy, `web/Dockerfile` ran bare
`vite preview`, and `docker-compose.yml` had no reverse proxy, so every browser
`GET /api/*` was answered by the SPA's own HTML fallback with 200, and every
POST returned 404. QA had to stand up a throwaway proxy outside the repo to
check anything at all.

**Mechanism:** the api suites call the server in-process and the web suites
mock `fetch`. Both are correct at their own level. The seam between them — a
browser, talking to a web server, reaching an api across a network — is the one
thing neither level instantiates, and the gate's five steps did not include
"open the product". The defect was introduced in wave 0 and survived two waves,
66 review passes and two integration runs. Nobody owned the line "this is how
the browser reaches the api", and every lane assumed another lane had.

**What that means for how this project tests.** A green gate here means *the
units and the handlers behave*; it has never meant *the product works*. Two
things changed because of this, and they are the sprint's most valuable output:

1. The gate grew a sixth step. `tests/smoke/` starts the composed stack and
   asserts over real HTTP that the SPA is served, that `/api/health` answers
   JSON **through the same origin the browser uses**, and that register-then-
   login sets a session cookie — plus wiring assertions that both the dev and
   preview proxies exist, that compose points the web service at the in-network
   api, and that `architecture.md` actually contains the paragraph explaining
   it. 11 tests. It runs in the full gate and in CI, never in wave mode.
2. Manual QA stopped being ceremony. Of the fifteen findings, **four were
   blockers that no unit or contract test could have seen**, and three of those
   four were about screens or wiring, not logic.

It is also an argument that stage 4.5 is too late. A smoke test that opens the
product belongs in wave 0, next to the health check — not after everything is
built.

### The rest, each with its mechanism

- **QA-02 / QA-03 — no front door, and a list that never fetched** (blockers).
  The app had no route for `/`, and the CV list rendered its empty state
  unconditionally without ever calling `GET /api/cvs`. Both are invisible to a
  suite that mounts a component directly with a stubbed loader.
- **QA-04 — a 503 silently locked all saving** (blocker). `answer.ts` bumps the
  CV version *before* recomposing, so an LLM failure left the server at version
  N+1 while the editor kept N; the editor then blocked every later save behind
  a "changed on another device" banner that was false, and whose only offered
  recovery discarded the user's edits. Without an API key this was the state
  after *any* answer.
- **QA-05 / QA-15 — the question column** (major, twice). Two lanes invented
  two question-path grammars (`summary` vs `summary.text`) and the contract
  wrote down neither, so two of three cards landed beside the wrong field, or
  ~5,000px below it on mobile. ADR-016 settled the grammar; the re-check then
  found the desktop column still placing cards in the API's array order rather
  than by their fields' offsets, stranding the third card 2,957px from its
  field.
- **QA-10 / QA-14 — a failed job left the CV `generating` forever** (minor),
  and the first fix was forward-only: existing rows stayed stuck until a
  reconcile pass was added at boot.
- **E-003, three times — a test pinning a sibling lane's temporary shape.** A
  lane asserts the literal current shape of a file another lane owns and is
  about to change (a placeholder that "renders nothing"; a regex demanding
  `api.register(cvsRoutes)` with no options). True when written, false the
  moment the sibling does its job, and structurally invisible to a lane gate
  because the test and its subject live in different lanes. One of the three
  turned out to be a real product defect — the CV editor's pending and error
  states rendered no heading at all — so the test was right and the code was
  wrong.
- **E-002 / E-004 / E-005 / E-006 / E-008 — five incidents, one defect.** The
  test suite shared a database with itself and with the running app. Two
  suites' workers stole each other's queued jobs (E-002). A suite that leaked
  ~50 queued rows was drained by the next suite's worker, which then hit a
  duplicate fact id — and a silent `catch` in the worker replaced the real
  Prisma P2002 with "The generation failed", which is why **that one cost a day
  disguised as a flake** (E-004). A probe cleaned up by name pattern and
  deleted 54 rows it had not created (E-005). A timing test slept 450ms against
  a 300ms lease (E-006). ADR-019 ends the class by giving the suite its own
  database; E-008 then showed that even so, two gate runs on one machine
  collide, because the advisory lock serialises *suites*, not *runs*.
- **E-007 — a fixture outlived the contract it encoded.** `scripts/seed-qa.ts`
  wrote its questions as literals and was the last thing in the repo still
  speaking the pre-ADR-016 grammar. QA drives real stored data, so a fixed
  contract looked unfixed for an entire re-check round. Fixture data that
  encodes a contract is a second source of truth and will drift.

**Worth recording:** every "flake" in this project turned out to have a
mechanical cause. None was randomness. The cost of calling one of them a flake
was a day; the cost of chasing each one was an hour.

## Where the build stands now

Measured 2026-10-29 on a quiet machine, serial runs only:

| Suite | Result |
|---|---|
| api | 587 passed / 5 skipped (53 files passed, 1 skipped) |
| web | 220 passed (30 files) |
| smoke (real stack over HTTP) | 11 passed |
| Full gate, consecutive serial runs | **10 of 10 green** |

The 10/10 is load-bearing: before E-008 was understood the same gate was 9/10
and 5/7, and the difference was nothing but two runs sharing one database.
**One gate run at a time per database** — if parallel runs are ever needed they
need a database each, not a lock each.

## The decisions that shaped the build

- **ADR-011 — six parallel lanes in one wave, no worktrees.** This is why the
  sprint took five hours instead of three sequential sprints. Worktrees are not
  available at lane granularity (the isolation flag wraps one agent; a lane is
  three agents sharing a tree), so isolation was bought with strictly disjoint
  file areas plus a bootstrap task (T-07) that creates every would-be-shared
  file up front. It worked — no lane ever edited another lane's file — and its
  cost is precisely the E-003 class: lanes cannot see each other, so a test
  that reaches across the seam is only caught at integration.
- **ADR-013 and ADR-016 — the groundedness rules and the path grammar.** ADR-013
  is the sprint's most important technical decision. A developer correctly
  diagnosed that the frozen types could not express the §3.4 entity rule, then
  wrote itself an amendment relaxing it — which would have shipped the exact
  failure the product exists to prevent: every token real, the combination
  invented (`{Acme Ltd, Backend engineer, 2019}` assembled from two true
  facts). The resolution: recombination is defeated by **co-occurrence**, not
  by citation. One cited fact must contain both the employer and the period, or
  the entry is dropped and asked about. ADR-016 then fixed the thing the
  contract had never said out loud — a question's `path` names the *field* the
  question is about — after two lanes each picked a reasonable grammar and QA
  found the result on screen.
- **ADR-014 and ADR-019 — the test database.** ADR-014 turned the job-queue
  suite lock from a convention into a helper with a guard test, because a
  convention a cheap model must remember is a convention that will be
  forgotten; it was measured, not assumed (turning off api file parallelism
  costs 12.5s against 4.0s, on the hottest loop in the project). ADR-019 then
  admitted that E-002, E-004, E-005 and the running container all competing for
  queued rows were **one defect wearing four hats**, and gave the suite its own
  database. Three individually correct fixes had each addressed a symptom.
- **ADR-015, ADR-017, ADR-018 — version, `lastError`, the error codes.** All
  three are the same instinct applied to three places: make the honest state
  reachable by the client. Answering a question bumps the version because
  `version` is the optimistic-concurrency token, not content, and a section
  that changed under a still version is a lost update waiting to happen. A
  failed CV carries its own error rather than a job id to go fetch, because a
  CV outlives its jobs and two round trips to render one line is not a design.
  And `LLM_AUTH_FAILED` / `LLM_INVALID_REQUEST` joined the closed enum so that
  `INTERNAL` goes back to meaning *our fault* — the single most likely failure
  in a fresh deployment is a mis-set API key, and it should not look like a bug
  in our code.

## What a reader would hit first

1. **Set an API key and run one generation.** Nothing in this repo has ever
   talked to Anthropic. Everything downstream — the verifier's real behaviour,
   the question quality, the PDF, the answer and regenerate paths — is
   currently an argument, not an observation.
2. **The README's Status section is stale.** It still says "Generation does not
   run… nothing starts the job worker" and that answer/regenerate "are not
   routed". Both became false in wave B: `api/src/main.ts` creates and starts
   the worker and reconciles on boot, and `api/src/routes/cvs.ts` routes both.
   The README is the graded deliverable and it currently understates what was
   built. Fix this first; it is ten minutes.
3. **The five container tests are skipped on every run.** Nothing in the gate
   exercises the built api image.
4. **Two gate runs on one machine still collide.** Serial only, per database.
5. **`architecture.md` now has a paragraph on how the browser reaches the api,
   and a smoke test asserts it is there.** Keep it true; that paragraph is the
   only thing standing between this project and QA-01 happening again.

## Process signals (feeds /retro)

- **Escalations: nine**, all from wave 0 and wave A lanes (01, 02, 04, 05, 06).
  Two were right and expensive — argon2 on Node 22 (ADR-012) and the
  recombination hole (ADR-013); both would have shipped a defect had the agent
  guessed. Two the lane logs themselves mark as avoidable: the defects were in
  the task's own test files. Three were brief defects, not capability gaps.
- **Briefs that needed rework: at least four.** An allowlist that contradicted
  its own acceptance criteria (FF-08); a dependency list that did not cover the
  toolchain, found incomplete three separate times (FF-04); `check-lane.sh`
  blind to untracked files, so a lane's new files passed isolation unchecked
  (FF-07); and the gate having no lane-scoped mode, so parallel lanes could not
  pass it at all (FF-10).
- **Knowledge recorded:** `framework/knowledge/errors.md` E-001…E-010 plus
  three topical blocks; `framework/knowledge/patterns.md` P-001…P-007;
  `framework/knowledge/framework-feedback.md` FF-01…FF-15, each with a template
  path or a lane report as evidence. Nineteen ADRs.
- **Lane logging decayed as the sprint went on.** Lanes 01–07 log tests, code,
  review, docs and decisions per task. Lanes 09–12 log the work but no `time:`.
  Lanes A–E — the five QA-fix lanes — are *empty files* for C, D and E, and one
  review note for A. The fixes are real and verified by QA; the record of how
  they were made is not. Anything the retro wants from the QA fix wave has to
  come out of git log, which is why the commit messages carry the narrative.
- **Commit discipline (FF-13).** "The Orchestrator commits per task" is a
  promise nothing enforces: wave B landed as four commits all stamped 09:22,
  so three lanes' work is not separable in history.
- **Docs-sync was followed everywhere except the README** — see "What a reader
  would hit first", item 2. The rule says docs change in the same change as the
  code; the one place it slipped is the file the owner is graded on.

## Next sprint candidates

In priority order, with the reason:

1. **Run one real generation, with a key.** Everything the product promises is
   downstream of this and none of it has been observed. Expect findings; the
   verifier has never seen a model's actual output, only fixtures written to
   provoke it.
2. **Move the smoke test to wave 0 and widen it.** The sixth gate step exists
   because the product shipped unopenable. It currently proves the SPA is
   served, same-origin `/api/health` answers JSON, and a register/login
   round-trip sets a cookie. It should also walk intake → list → editor,
   because QA-02 and QA-03 were separate blockers that a two-click smoke would
   have caught.
3. **Fix the README Status section.** Ten minutes, and it is the graded
   deliverable.
4. **Un-skip the container tests**, or delete them and say so. Five permanently
   skipped tests are a claim nobody is checking.
5. **Make `time:` enforceable.** No velocity data came out of this sprint. A
   gate check or a lane-close hook, not a better template.
6. **B-024, the framework harvest**, once the above is done — fifteen findings
   with evidence, applied to the template in a single pass.
