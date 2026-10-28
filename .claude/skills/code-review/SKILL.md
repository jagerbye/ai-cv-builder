---
name: code-review
description: Review the current diff (or a named branch/PR) against spec criteria, rules and tests, via the code-reviewer agent. Use when the owner asks for a review outside the sprint loop.
---

# /code-review — standalone review

1. Determine the diff (working tree, branch, or PR the owner named) and
   which task/feature it claims to implement; fetch that feature's criteria
   from `framework/docs/spec.md` (or the lane brief if it exists).
2. Spawn the **code-reviewer agent** with: the diff scope, the criteria, and
   the rules files. Big diff → split by component and run reviewers in
   parallel, one component each.
3. For risk areas (auth, money, migrations, concurrency) add a second pass
   on a Sonnet-class reviewer — cheap first filter, stronger second look.
4. Merge verdicts, deduplicate, rank by severity, report to the owner as
   concrete failure scenarios (file:line, what breaks, how to see it).
   Review findings that reveal recurring causes → candidates for
   `framework/knowledge/errors.md` Prevention lines.
