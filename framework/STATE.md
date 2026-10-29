# STATE.md — the project's "now" (≤40 lines, hard cap)

> **What this file is:** the Orchestrator's externalized working memory — the
> only file besides CLAUDE.md a session needs to resume.

## Now

- **Sprints 01 and 02 closed**; board: 45 rows, all Done.
- **Green:** api 826 / 1 skipped, web 251, smoke 11 / 1 skipped; lint,
  typecheck, build clean. One gate run at a time per database (E-008).
- **Proven live on four source texts** (ordinary, sparse, messy, ADR-030
  regression): register → free text → generation → grounded draft with
  questions → answer → manual edit → A4 PDF.
- **Post-close review pass (2026-10-29), five items, all done:** ADR-030 / E-014
  (a required contact field the model never drafted is now a question); E-015
  (the prompt was sent twice per call); an unused dependency dropped; runner
  scripts, lane logs and QA screenshots deleted (framework/: 2.9 MB / 156 files
  → 724 KB / 60); README and SUMMARY re-checked against the commands they cite.
- **Nothing is in flight.**

## Waiting on

Nothing blocking. Route and retry budget are configuration.

## Next 3 actions

1. An automated browser test of the real flow: manual QA found four blockers no
   suite could see, and nothing yet drives the actual screens.
2. More live sources, and the shapes never tried: two-column PDF, non-English.
3. Generalise the ADR-030 completeness rule beyond the two contact fields.

## The guarantee (ADR-002, 013, 022-028, 030)

A structured claim — employer, institution, skill, contact field — is
established by a whole word in one of its own cited facts, or it is removed and
asked about at priority 1; a REQUIRED contact field the draft never carried is
asked about too. Prose is flagged where the user sees it, never deleted. The
verifier is pure, and a question binds to the item it is about. Limits are in
ADR-024, ADR-025 and ADR-028, not implied away: skill aliases ("JS" vs
"JavaScript") drop with a question, and no alias dictionary is coming.
