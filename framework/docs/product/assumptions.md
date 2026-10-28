# assumptions.md — what we believe but haven't proven

> **What this file is:** the risk register of discovery: every load-bearing
> belief with a plan to validate it cheaply. Reviewed at every retro — a
> killed assumption caught early is the cheapest work this project will
> ever do. The skeptic feeds it; reality empties it.

Discovery was skipped for this project (ADR-008): the owner supplied a written
brief, not a raw idea. This file therefore holds only **BA inferences** — the
places where the brief was silent and the spec had to decide anyway. Each one
is a question the owner can overrule in one sentence.

---

## A-01 Sonnet 5.5 is the right model for both pipeline stages

- Risk if false: cost or latency blows the 180 s budget (too big), or
  extraction misses facts and the CV is thin (too small).
- Confidence: medium — reasoned from the task shape (structured extraction +
  constrained composition), not measured. (assumption, unverified)
- Cheapest validation: run the 5 golden fixtures through Haiku 5.5, Sonnet 5.5
  and Opus 5.5 in sprint 2 and compare facts-extracted count, verifier drop
  rate and latency. Validated = Sonnet within budget and ≥95% of Opus's fact
  recall. The model id is config (ADR-006), so the switch is free.
- Status: open

## A-02 "Must not invent facts" means checkable provenance, not stylistic caution

- Risk if false: we built an expensive verifier for a requirement the owner
  meant loosely — though the cost is two LLM calls, not a wasted sprint.
- Confidence: high — the brief pairs it with "anything missing or vague
  becomes a question", which only makes sense if gaps are detected mechanically.
- Cheapest validation: the README states the interpretation in one paragraph;
  the owner can disagree while reading it.
- Status: open

## A-03 Polling every 2 s is acceptable progress feedback

- Risk if false: the generation screen feels dead and the "frozen screen"
  requirement is judged unmet.
- Confidence: medium — three named stages change visibly every 10–40 s.
- Cheapest validation: QA watches a real generation at both viewports in
  sprint 2 and says whether it reads as alive. Fallback is B-021 (SSE).
- Status: open

## A-04 No photo in the CV

- Risk if false: a missing field reviewers expect in some markets.
- Confidence: medium — the brief lists "contact details, summary, experience,
  education and skills" exhaustively, and photos are a regional convention.
- Cheapest validation: one line in the README's "what we cut".
- Status: open

## A-05 The CV stays in the source's language

- Risk if false: a user pastes a Russian CV, targets an English-language role
  and expects translation.
- Confidence: medium — translation is a second kind of rewriting and the brief
  never mentions language. (assumption, unverified)
- Cheapest validation: README line; if the owner wants it, it is one prompt
  change in the compose stage plus a fixture — not an architecture change.
- Status: open

## A-06 10 MB / 20 pages / 200 characters are the right intake limits

- Risk if false: a legitimate CV is rejected.
- Confidence: medium — a text CV is far under these; the 200-character floor
  is there to catch scans, which the brief's "or describes their background in
  free text" path covers anyway.
- Cheapest validation: QA tries a real 3-page CV export from LinkedIn.
- Status: open
