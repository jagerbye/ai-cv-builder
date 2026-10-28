# rule: docs follow code, same change (always on)

> **What this file is:** the rule that keeps this framework alive. Stale docs
> are worse than none: agents will confidently build against last month's
> reality. So docs are updated IN THE SAME change as the code, and the
> reviewer checks it like any other acceptance criterion.

If your change touches… → update…

| Change | Doc |
|---|---|
| behavior users can see | `framework/docs/spec.md` (that feature's section) |
| a component's responsibility or a data flow | `framework/docs/architecture.md` |
| an interface between components | `framework/docs/api-contracts.md` (ADR if frozen) |
| entities / invariants | `framework/docs/domain-model.md` |
| schema / migration | `framework/docs/database-schema.md` |
| how to run or deploy | the relevant runbook |
| a decision with rejected alternatives | `framework/docs/decisions.md` (new ADR) |

- "Docs touched: none" in a lane report is a claim the reviewer verifies.
- Never retro-document "later": later is never, and the next sprint pays.
