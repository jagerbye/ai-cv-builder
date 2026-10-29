# Sprint 02 — live-model  (2026-10-29)

> **What this file is:** the plan for the work that began the moment the
> project stopped being able to avoid its one untested path. Sprint 01 shipped
> a product whose every Anthropic call went through a mocked seam, and said so
> in the README. The owner supplied a key; this sprint is what the key found.

- **Goal (owner's language):** prove the whole flow on a real model, and fix
  what that proves wrong.
- **Why it is a sprint and not a hotfix:** six issues, five ADRs and three
  amendments, two of which change the product's central guarantee. A hotfix
  loop is for QA findings with a known cause; this had neither.
- **Base ref:** `75c6a15` (sprint 01 closed, gate green 10/10 serial runs)
- **Entry state:** 822 tests green, 15 QA findings closed, zero real model calls.

## Lanes

Sequential by necessity, not by choice: each finding was only visible once the
previous fix let the pipeline run one stage further. That is itself the result
— a mocked seam cannot be walked past.

| Lane | Issue | Task |
|---|---|---|
| answer | CVB-39 | ADR-020 — the answer path reported a missing key as "try again later" |
| gateway | CVB-40 | the endpoint was hard-coded, so no key could be pointed at it |
| budget | CVB-41 | ADR-021 — one number was both the output cap and the spend budget |
| budget-fix | CVB-42 | Amendment A — "optional ledger" left the answer path unbounded |
| method | CVB-43 | the vendored method was older than the template its findings fed |
| grounding | CVB-44 | ADR-022 / ADR-023 — the verifier deleted the jobs it had just asked about |

## The chain, in the order it actually happened

1. **The key could not be used at all.** The gateway built its client with an
   api key and nothing else, so the endpoint was whatever the SDK defaulted to.
   One missing option stood between the project and the evidence it lacked.
2. **The first call failed, and the failure was ours.** Extract returned
   fifteen facts with verbatim quotes; compose failed with `LLM_INVALID_OUTPUT`
   and `parse` was never called — the gateway had cut itself off. One
   configuration number was serving as both the response cap and the spend
   bound, and an ordinary CV crosses it. The model had behaved correctly.
3. **The fix had a hole, and the reviewer found it.** Calling the new ledger
   "optional" left the one production path without a ledger — the answer
   recompose — bounded by nothing, where before it had been bounded by 4096.
   A test had been written that pinned the unbounded behaviour; by this
   project's own rule that test was wrong, not the code.
4. **The flow then ran end to end — and produced an empty CV.** Zero
   experience, zero education, no contact, no summary, from a source stating
   two jobs, a degree and full contact details. The verifier had applied
   ADR-013 literally: the model wrote `2019 - Present` where the source says
   `Since 2019`, the strings did not match, and a real job was deleted — right
   after the verifier raised exactly the right question about it.
5. **Attacking the fix found the deeper defect.** Invented organisations were
   being caught by a hard-coded list of company names. "…a decade at Google"
   was dropped; "…a decade at Stripe" passed silently. The product's single
   claim was being enforced against an enumeration of famous employers.

## Decisions this sprint produced

| ADR | What it settles |
|---|---|
| ADR-020 | C-009's 503 carries the code the failure actually had |
| ADR-021 | the output cap and the spend budget are two numbers; a budget stop says so |
| ADR-021 A | the ledger is optional in the type and mandatory in practice, with a guard |
| ADR-022 | employer strict, period lenient — a reformatted date is a question, not a deletion; the CV gets its contact block |
| ADR-022 A | a kept summary must not keep an invented entity; the co-occurrence blind spot is stated, not papered over |
| ADR-023 | the facts are the vocabulary — no list of known organisations |

## Exit criteria

- The full flow runs on a real model: register → free text → job → draft with
  questions → answer → manual edit → A4 PDF, with the stored CV carrying the
  experience, education and contact the source states.
- `framework/scripts/gate.sh` green, including the smoke step.
- The board and `HISTORY.md` record it.
