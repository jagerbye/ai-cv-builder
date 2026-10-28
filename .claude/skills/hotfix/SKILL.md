---
name: hotfix
description: Cheap, fast fix loop for QA findings and small defects — one Haiku dev per finding, gates still run, QA re-checks only the fixed screen. Use for non-blocker QA findings or an owner-reported small defect.
---

# /hotfix — the cheap repair loop

For defects that don't deserve the sprint machinery: QA findings
(major/minor/visual), small owner-reported bugs. Quality stays, ceremony
goes.

1. **Input:** finding(s) with repro + evidence (a qa-report entry, or write
   one from the owner's words). No repro → reproduce first; can't → back to
   the reporter, don't guess.
2. **Batch by file area:** findings touching the same component go to ONE
   dev agent; disjoint batches run in parallel.
3. **Per batch — brief a Haiku developer** (lane-brief template): the
   findings verbatim with screenshots/repro, exact file list, grep keywords
   for `framework/knowledge/errors.md`. Rules still apply: testable logic bug → test
   first; pure visual fix → no test theater, the proof is re-QA.
4. **Gates:** `framework/scripts/gate.sh` must stay green — a hotfix that breaks a
   test is a regression, not a fix. Escalation ladder applies (Haiku →
   Sonnet, two attempts max).
5. **Verify:** qa-engineer re-checks ONLY the fixed screens at the affected
   viewports; flips finding statuses in the report (`open → fixed`, with a
   after-screenshot).
6. **Close:** non-obvious root cause → E-NNN in `framework/knowledge/errors.md`;
   a fix revealing a spec/design gap → note for BA/Architect. One line in
   the sprint's report (or the ad-hoc qa file) saying what was hotfixed —
   history must show it.
