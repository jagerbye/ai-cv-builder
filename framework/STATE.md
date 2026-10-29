# STATE.md — the project's "now" (≤40 lines, hard cap)

> **What this file is:** the Orchestrator's externalized working memory — the
> only file besides CLAUDE.md a session needs to resume where the last stopped.

## Now

- **Sprints 01 and 02 both closed.** 01 built the product; 02 took it to a real
  model and fixed what that proved wrong. Board: 42 issues, all Done.
- **Green:** `gate.sh` ✓ — api 811 / 1 skipped, web 251, smoke 11. One gate run
  at a time per database (E-008).
- **Proven live four times**, on three source texts (ordinary, sparse, messy)
  and once on the current build: register → free text → generation → grounded
  draft with questions → answer → manual edit → A4 PDF.
- **Nothing is in flight.**

## Waiting on

Nothing blocking. The route and the retry budget are configuration
(`ANTHROPIC_MODEL`, `ANTHROPIC_RETRY_BUDGET_SECONDS`): one proxy refused
tool-use at roughly two in three, so the environment moved, not the defaults.

## Next 3 actions

1. An automated browser test of the real flow — manual QA found four blockers
   no suite could see, and nothing yet drives the actual screens.
2. More live source texts. Each of three found something; one run is an
   existence proof, not a sample.
3. B-024's two notes for the next project: a test-engineer `blockedOn: code`
   has no rung on the ladder; a blocked task lands in two lists.

## The guarantee (ADR-002, 013, 022-028)

A structured claim — employer, institution, skill, contact field — is
established by a whole word in one of its own cited facts, or it is removed and
its absence asked about at priority 1. Prose is flagged where the user sees it
and never deleted. The verifier is pure. A question binds to the item it is
about, so it is never shown against a line it was not written for. The limits
are in ADR-024, ADR-025 and ADR-028, not implied away. Skill aliases ("JS" vs
"JavaScript") drop with a question; no alias dictionary is coming.
