# patterns.md — proven solutions to reuse

> **What this file is:** the positive twin of errors.md: approaches that
> worked well here and should be copied, not reinvented. A pattern earns its
> place by being used twice. Teamlead links relevant patterns in lane briefs
> ("Read: framework/knowledge/patterns.md §P-NNN").
> **Who writes it:** `/retro`, from lane reports and review notes.

Format:

```
## P-NNN <name>  (YYYY-MM-DD)
- **Problem:** when to reach for this.
- **Solution:** the approach, with a pointer to a reference implementation
  in the codebase (path), not a code dump.
- **Trade-offs:** when NOT to use it.
```

---

## P-001 Ambiguity is resolved in the spec, as exact expected values  (2026-10-23)

- **Problem:** cheap models fail open-ended tasks; most "model is too weak"
  escalations are really ambiguity the spec left for the agent to decide
  (e.g. WHICH transliteration standard, HOW a pager marks gaps).
- **Solution:** the spec states concrete input→output pairs for every
  ambiguous point (full mapping table, literal expected arrays), and briefs
  copy them verbatim. Observed effect: cheap-model lanes go green first try
  with zero escalations when every ambiguity is pre-resolved this way.
- **Trade-offs:** spec takes longer to write; worth it whenever work is
  delegated to cheap models or parallel teams. Don't gold-plate parts no
  lane depends on.

## P-002 Index errors by the resource they contended for, not by their symptom  (2026-10-29)

- **Problem:** a recurring cause stays invisible when each occurrence wears a
  different symptom. Four incidents in sprint 01 — E-002 (two suites' workers
  stealing each other's jobs), E-004 (a suite leaking fifty queued rows for
  the next suite's worker to drain, a day lost calling it a flake), E-005 (a
  cleanup deleting 54 rows it had not created), E-008 (two gate runs claiming
  each other's rows) — were one defect: **the suite shares a database with the
  app.** Each was found by a different agent, in a different lane, with a
  different error text, and each was closed by a correct local fix. Nothing
  compared them, because errors.md is greppable *by symptom* and the symptoms
  had nothing in common; the root-cause lines were each true and each local.
- **Solution:** every errors.md entry whose fix adds or tightens a
  **coordination mechanism** — a lock, a cleanup rule, an ordering convention,
  a guard, a "remember to" — carries one line naming the **contended
  resource** (`generation_jobs` queue, the `ai_cv_builder` database, host port
  5173, `api/src/server.ts`). Before writing such an entry, grep
  `Contended resource` for that resource. **A second hit is not a third entry:
  it is the signal that the resource must be split, not shared** — and that
  decision goes to an ADR (here: ADR-019, the suite gets its own database).
  Reference: E-009 in errors.md carries the index for this project.
- **Trade-offs:** one line per entry, and only for mutual-exclusion fixes — a
  logic bug has no contended resource and should not get a fake one. The rule
  deliberately fires on the *second* occurrence, when the evidence is still
  thin; the alternative here cost four fixes, three of which were kept and
  none of which was sufficient.

## P-003 One test instantiates the seam nobody owns  (2026-10-29)

- **Problem:** two correct test levels can leave a hole between them that is
  the product. The api suites call the server in-process, the web suites mock
  `fetch`; neither instantiates a browser talking to a web server reaching an
  api over a network. The gate was green on three consecutive full runs — 534
  api tests, 157 web tests, typecheck, lint, build — while the shipped
  container had no route to the api at all, so nobody could sign in (QA-01).
  The defect entered in wave 0 and survived two waves, eighteen reviews and an
  integration pass.
- **Solution:** the gate grows a step that starts the composed stack and
  asserts, over real HTTP on the real ports, the few things only the seam can
  prove: the SPA is served, `/api/health` answers JSON **through the origin the
  browser uses**, and a register-then-login round-trip sets a cookie.
  Reference: `tests/smoke/`, wired as the `smoke` step in
  `framework/scripts/gate.config.sh`; it runs in the full gate and CI, never in
  wave mode. The companion half is documentary: `architecture.md` must name how
  the browser reaches the api, because here nobody owned that line and every
  lane assumed another lane had.
- **Trade-offs:** slow, and it needs Docker, so it cannot be the inner loop.
  Keep it to the seam — three assertions, not a second end-to-end suite. The
  smoke suite drives the real stack, so it writes to the **app's** database and
  must clean up by collected id (P-005), not by the gate's `DATABASE_URL`.

## P-004 The stub test is performed, not judged: delete the line and watch it go red  (2026-10-29)

- **Problem:** "would a hard-coded happy value pass this suite?" is a question
  a reviewer answers by reading, and reading says yes too often. Sprint 01 shipped
  four different kinds of lying test past that reading: one that **asserted
  nothing** (removing the null-clear from `persist.ts` left "a successful run
  clears last week's error" green); two that **pinned a defect** (`classify()`
  copying a thrown error's own message into the job row a browser reads — a
  latent leak, with two tests holding it in place); one that was **satisfied by
  the error path** (under a 404 stub the route-registry check passed on the
  error state and proved nothing about the editor); and two that **pinned a
  sibling lane's temporary shape** (P-006).
- **Solution:** the reviewer does the mutation instead of imagining it — name
  the one line of production code the test exists for, delete or invert it, run
  the test, require red, restore. The fix-list records the mutation performed,
  not the opinion. It catches all three of the first kinds mechanically and
  costs one minute per criterion. Reference: the review of `57848cb` found the
  nothing-asserting test exactly this way, and `d7c721f` found the two tests
  pinning the leak. Corollary that fell out of the same pass: **a test that
  pins a leak is wrong** — when the mutation shows the assertion is protecting
  the defect, the code changes and the test is rewritten, never the reverse.
- **Trade-offs:** it needs a named line, so it does not apply to a test whose
  subject is an absence (no secret in the log, no stray key in `.env.example`);
  for those the inverse is to *add* the forbidden thing and require red. It
  also cannot see the test that has no subject yet — the missing seam (P-003).

## P-005 Destructive cleanup names identities, never patterns or counts  (2026-10-29)

- **Problem:** "delete the rows my probe made" is a one-liner by prefix, name
  or time window, and it is right exactly as long as the database holds only
  your own work — which is never true of a shared test database. A probe that
  created 3 users deleted 57 (E-005). The same shape in reverse: a leak check
  that compares **counts** cannot tell a new leak from an old job finishing.
- **Solution:** collect ids while creating and delete by that list; compare
  identity sets, not totals, at the run boundary. Reference:
  `api/src/core/jobs/test-global-setup.ts` — a vitest `globalSetup` snapshots
  user ids and open job ids before anything runs, fails the run if either set
  grew, names the owning emails, and **deletes nothing** (the database legitimately
  holds hundreds of rows from earlier runs). Both hardening suites' `afterAll`
  and the smoke suite's cleanup follow the same discipline.
- **Trade-offs:** a guard that deletes nothing leaves the operator to clean up,
  which is correct for a shared database and wrong for ephemeral CI — there,
  drop the database instead. The rule binds throwaway probes typed at a prompt
  exactly as hard as committed code; that is the case it was written for.

## P-006 A cross-lane test asserts a contract; only its own lane may pin a shape  (2026-10-29)

- **Problem:** a test that encodes the current shape of a file another lane
  owns is true when written and false the moment that lane does its job, and
  **no lane gate can see it** — the test and its subject are in different
  lanes, so only the union finds it, at integration, when the cost is highest.
  Three instances in sprint 01 (E-003 and wave A conflict 1): a web route
  registry asserting that feature modules "render nothing", the same registry
  requiring an `h1` the editor's pending state did not have, and an api
  registry pinning the literal text `api.register(cvsRoutes)` that a later
  task had to pass an option to.
- **Solution:** across a lane boundary a test may assert only what the frozen
  contract names — a landmark, an export, a call, a status code — never a
  literal shape. It is mechanically checkable: the reviewer runs the files a
  test names against the lane's own allowlist, and any assertion about a file
  outside it must quote a contract id. And when a conflict does appear, **ask
  first whether the code is wrong**: two of the three here were product defects
  (a screen with no heading for a slow or failed request is a real bug), and
  fixing the code was right where weakening the test would have hidden it.
- **Trade-offs:** contract-level assertions are weaker, so pair each with a
  shape-level test inside the owning lane. Where the contract itself is what
  changed, the test is corrected with reviewer sign-off and an errors.md entry
  (rules/testing.md) — never quietly loosened.

## P-007 A block is a successful step, and its boundary is your allowlist  (2026-10-29)

- **Problem:** the escalation ladder assumes a stuck task is a capability
  failure, so it sends a stronger model to retype the same brief. In wave A all
  four escalations were **decisions that belonged to the Architect** — a
  missing dependency, a rule contradicting its own golden fixture, a lane test
  glob sweeping a sibling's suite. A stronger model cannot resolve any of
  those; it pays twice to be told the same thing.
- **Solution:** the agent result schema carries `blockedOn: code | brief |
  decision | dependency` (FF-11). Only `code` escalates a tier; the other three
  stop the task and return a question to the Orchestrator. Reference: the
  `blockedOn` field and preamble line in `.claude/workflows/*.js` — "Reporting
  a block is a successful step. Do not write yourself an ADR." **Measured
  result: across waves A and B and the QA fix rounds, not one task returned
  `blockedOn: code`.** The capability rung of the ladder was never used in this
  sprint; every block was a one-line question, and four of them became ADRs
  (013 amended, 014, 015, 018) instead of improvised rules.
- **Trade-offs:** the half that must be stated with it — **a block is only
  valid for something your allowlist or your brief cannot settle.** A defect in
  a file you own is your task: a T-19 developer escalated two failures that
  were in its own allowlisted test files with documented fixes, and the
  reviewer's note names the cause — "developers treat their own allowlisted
  test files as off-limits". The other cost is latency: a blocked lane stalls
  until the next workflow pass rather than moving to its next independent task,
  which FF-11 proposed and the runner does not yet do.

## P-008 Spike before deciding anything the world gets a vote on  (2026-10-29)

- **Pattern:** split decisions by who supplies the inputs. If this repository
  supplies them, argue and record. If something outside does — a provider, a
  model, real text, a library's real semantics — run a timeboxed experiment
  against the real thing FIRST and attach its output to the record.
- **Why:** an argument can be internally perfect and about a world that does
  not exist. Every expensive correction in this project's second sprint was of
  that shape, and each one was cheap to measure and costly to assume.
- **How to tell you are in it:** the decision contains the words "should",
  "typically" or "we expect" about something you have never run.
- **Cost:** a spike is minutes to hours. A guess discovered in front of a user
  costs a round, and sometimes the guess has already shaped three other
  decisions by then.

## P-009 Adversarial review needs a stopping rule, because nothing else stops it  (2026-10-29)

- **Pattern:** adversarial review is the highest-yield role in this process and
  the only one with no termination condition. Give it one: when a SECOND round
  on the same component returns findings at least half as numerous as the
  first, and none of them is a regression of a first-round fix, stop. The
  component is re-scoped or its guarantee narrowed to what the implementation
  can keep, and the residue is written down as a stated limit. A third round is
  an explicit decision somebody signs, not the default.
- **Why the threshold and not a count:** a second round that finds one thing is
  a component converging. A second round that finds a comparable crop is
  evidence about the MECHANISM — it is not that more effort is needed, it is
  that this approach cannot close.
- **Worked example:** three rounds on one checker here. Each fixed the previous
  round's holes and opened new ones. The fourth round was not run; the promise
  was changed instead, and the component lost more than half its code.
- **The inverse, equally important:** a bounded problem must NOT be stopped
  early. When the reviewer could enumerate the whole space — every separator a
  name can contain — the right move was to finish the list, not to invoke this
  rule. The test is whether the space can be written down.

