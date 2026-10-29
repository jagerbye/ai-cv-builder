# rule: testing (always on)

> **What this file is:** the always-on test constraints. The full strategy
> (levels, locations, commands) is framework/docs/testing-strategy.md; these are the
> lines no agent may cross.

- Tests come FIRST: a task begins with failing tests from its acceptance
  criteria. Code with no failing test to satisfy is scope creep.
- Never weaken, skip, or delete a test to go green. A wrong test is fixed
  via reviewer sign-off + an errors.md entry, nothing less.
- Never mock what you can run: prefer real modules in-process; mock only
  true externals (network, clock, payments).
- A bug fix starts with a test that reproduces the bug.
- **The stub test is performed, not judged:** every test asserts concrete
  values/behavior, including at least one error case per criterion. The
  reviewer names the one line of production code the test exists for, deletes
  or inverts it, runs the test, requires RED, restores — and records the
  mutation performed in the fix-list. Reading the test and deciding it looks
  fine is not this check (knowledge/errors.md E-010, patterns.md P-004). Where
  the subject is an absence (no secret in the log, no stray key), add the
  forbidden thing and require red instead.
- **A test that pins a leak or a defect is wrong.** When the mutation shows an
  assertion is protecting the bug, the CODE changes and the test is rewritten.
  The same order of questions applies to any failing assertion: ask whether the
  code is wrong before touching the test.
- **Across a lane boundary, assert the contract, never the shape.** A test may
  pin the literal shape only of files inside its own lane's allowlist; about a
  file another lane owns it may assert only what the frozen contract names — a
  landmark, an export, a call, a status code. No lane gate can catch a
  violation; only the union can, at integration (errors.md E-003, P-006).
- **Destructive cleanup names identities.** A suite, a fixture or a throwaway
  probe deletes by the ids it collected while creating, never by prefix, name
  pattern, time window or "everything that looks like mine"; a leak check
  compares id sets, not counts (errors.md E-005, P-005).
- "Green" means `framework/scripts/gate.sh` passes — the same command hooks and CI
  run — not "the one test I ran".
