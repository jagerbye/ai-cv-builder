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
- **The stub test:** every test must assert concrete values/behavior,
  including at least one error case per criterion. If an implementation
  returning a hard-coded happy value would pass the suite, the suite is
  decoration, not a test — the reviewer checks exactly this.
- "Green" means `framework/scripts/gate.sh` passes — the same command hooks and CI
  run — not "the one test I ran".
