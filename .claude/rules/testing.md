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
- **A fixture for an external dependency is recorded, not written.** The
  first fixture for any external — a provider response, a webhook body, a
  third-party file — is a capture of ONE real exchange, taken once with
  `framework/scripts/record.sh`, secrets stripped at capture time, committed
  under `tests/fixtures/recorded/` and dated. Later fixtures may be edited
  copies of it (that is how the truncated, malformed and adversarial cases
  are built), but the original stays as the reference and a hand-invented
  shape is never the first one. A plausible, consistent, imagined fixture
  passes every test and fails the first real call. A recording never
  contains a credential; the reviewer scans it (`record.sh --scan`) before
  it lands.
- **A mock proves our side of the boundary, never the boundary's.** A test
  against a mock shows what the code does when the dependency answers thus;
  it says nothing about whether the dependency answers thus. Each half of
  every boundary needs one test that touches the real thing: the recording
  above for an external's side, a smoke test (`tests/smoke/`) that
  instantiates the seam (not a mock of it) for a seam between our own parts.
  A suite in which every level mocks its neighbour can be fully green while
  nothing connects.
- A bug fix starts with a test that reproduces the bug.
- **The stub test is performed, not judged:** every test asserts concrete
  values/behavior, including at least one error case per criterion. The
  reviewer names the one line of production code the test exists for, deletes
  or inverts it, runs the test, requires RED, restores — and records the
  mutation performed in the fix-list. Reading the test and deciding it looks
  fine is not this check: a suite that stays green with its subject deleted
  is decoration (knowledge/errors.md E-010, patterns.md P-004). Where the
  subject is an absence (no secret in the log, no stray key in an example
  config), add the forbidden thing and require red.
- **A test that pins a leak or a defect is wrong.** When the mutation shows an
  assertion is protecting the bug, the CODE changes and the test is rewritten.
  The same order applies to any failing assertion: ask whether the code is
  wrong before touching the test.
- **Across a lane boundary, assert the contract, never the shape.** A test may
  pin the literal shape only of files inside its own lane's allowlist; about a
  file another lane owns it may assert only what the frozen contract names — a
  landmark, an export, a call, a status code. A pinned sibling shape is true
  when written and false the moment that lane does its job, and no lane gate
  can see it; only the union can, at integration (errors.md E-003, P-006).
  Pair each contract-level assertion with a shape-level test inside the
  owning lane.
- **Destructive cleanup names identities.** A suite, a fixture or a throwaway
  probe deletes by the ids it collected while creating, never by prefix, name
  pattern, time window or "everything that looks like mine" — on a shared
  resource that set is other people's data. A leak check compares id sets,
  not counts (errors.md E-005, P-005).
- "Green" means `framework/scripts/gate.sh` passes — the same command hooks and CI
  run — not "the one test I ran".
