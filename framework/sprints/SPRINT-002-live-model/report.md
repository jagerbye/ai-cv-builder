# Sprint 02 — live-model · report  (2026-10-29)

> **What this file is:** what the key bought. Sprint 01 shipped a product whose
> every model call went through a mocked seam and said so in the README. This
> sprint walked that seam and fixed what walking it revealed.

## The flow, on a real model

Seven steps, run against the composed stack with a real provider key and no
mocks anywhere in the path. Script: the orchestrator's, reproducible.

| # | Step | Result |
|---|---|---|
| 1 | register | 201, session cookie set |
| 2 | intake — free text + target role | 201 |
| 3 | generation (real model) | job `succeeded` |
| 4 | the stored CV | 2 experience entries, 1 education, full contact, summary, 15 facts |
| 5 | answer a question (C-009) | 200, version 2 → 3, user fact stored |
| 6 | manual edit (C-008) | 200, persisted; stale version → 409 |
| 7 | PDF export (C-011) | 200, `%PDF-1.3`, real text layer, 2 pages |

What step 4 produced, which is the product's whole purpose:

```
0.95  Brightpath Payments | Backend Engineer     | Since 2019   (2 bullets)
0.70  Ferro Systems       | Data Pipelines Engineer | 2016 to 2019 (2 bullets)
15 facts, every one with a verbatim quote
every quote occurs verbatim in the source
every cited factId resolves
1 open question: experience[1].role —
  "Which job title did you hold? The drafted title is not in the cited source."
```

That question is the design working. The source says *"doing data pipelines in
Python"*; the model drafted the title *Data Pipelines Engineer*. The title is
not in the evidence, so the entry is kept and the user is asked. Nothing was
invented and nothing was deleted.

## Three source texts, not one

The first run proved the flow. Two more were chosen to attack the parts most
likely to behave badly, and both ran all seven steps green.

**A sparse source** — no dates, no company names, an unfinished degree:
"worked at a fintech startup, then at a bigger company". The model did not
invent names. It used the words the source gave — `Bigger company`,
`Fintech startup` — with the period `Not specified`, and raised **five
questions**: both periods, the education period, and both job titles. That is
the system telling the user exactly what it does not know, which is the
product's purpose.

**A messy source** — stream of consciousness, a contradiction in its own
dates, contract work under NDA, and a job the author suggests omitting:

```
1.00  Vela Health         | Platform Engineer     | 2019 - Present
0.95  Contract            | Kubernetes Consultant | About a year
0.40  NorthStar Logistics | Software Engineer     | 2014 - 2017 or maybe early 2018
0.30  Startup             | Software Engineer     | 2016 (6 months)
```

The model **carried the source's own uncertainty through verbatim** rather
than picking a date and pretending to know. The job the author said was
"probably not worth mentioning" is present at the lowest relevance — the data
is the user's, and the hint shaped the ranking rather than deleting anything.
Eight questions, all correct.

One flag is a documented limit firing exactly as designed: the summary said
`CI/CD`, the source says only "CI from jenkins to github actions", and the
checker flagged the acronym `CD` as unsupported. A false positive — and it
raises a question instead of deleting the text, which is the trade ADR-025
chose deliberately.

Two findings from the sparse run, recorded and not fixed: a period renders as
the literal string `Not specified` where an empty value would read better, and
nothing asks the user to name a company called `Bigger company`. Neither
invents anything; both would make the first draft less awkward.

## The fourth run: the current build, and what the provider taught us

The three runs above were made before ADR-027, ADR-028 and ADR-029 landed —
question binding, whole-word matching, and the retry policy. Those changes are
significant enough that the flow was run again on the build that carries them.
Seven steps green: two experience entries, education, full contact, summary,
eleven facts each with a verbatim quote occurring in the source, every cited id
resolving, one honest question about a job title the source does not state, a
PDF with a real text layer.

The answer step reports `version 2 → 4` — two bumps, because the answer now
stores a user fact AND restores what the new evidence supports. That is
ADR-027's third fix, visible from outside.

**Getting there produced ADR-029.** The first attempt failed at generation
while a hand-made call to the same provider seconds earlier returned 200. The
retry policy satisfied F-010's wording — "exponential backoff up to 3
attempts" — with a 500 ms base, so three attempts spanned a second and a half
against a condition that outlasted them. Then the measurement the ADR itself
demanded: six tool-use requests twenty seconds apart returned 429, 429, 200,
429, 200, 429. **Intermittent at one success in three, not a sustained
outage** — which makes the number of independent attempts matter more than the
length of any pause, and explains why a generation needing two provider calls
failed roughly every third time.

Two things were deliberately NOT done about it. The defaults were not tuned to
one proxy's bad afternoon — the environment raises
`ANTHROPIC_RETRY_BUDGET_SECONDS` instead, which is what made it configuration.
And the route was changed in configuration, not in code, when one model id
turned out to pass tool-use requests the other was being refused. The product
did not move; its settings did.

## What the key found

Five defects, in the order they surfaced. Each was hidden behind the previous
one — a mocked seam cannot be walked past, which is this sprint's real finding.

1. **The endpoint was hard-coded.** The gateway built its client with a key and
   nothing else, so no key could be pointed anywhere. One missing option stood
   between the project and the evidence it lacked.
2. **The first call failed, and the failure was ours.** Extract returned fifteen
   facts with verbatim quotes; compose failed and the parser was never even
   called. One configuration number served as both the response cap and the
   spend bound, and a real CV crosses it every time (ADR-021).
3. **The fix had a hole.** Calling the new ledger "optional" left the answer
   path bounded by nothing, where it had been bounded before. A test had been
   written that pinned the unbounded behaviour; by this project's rule the test
   was wrong, not the code (ADR-021 A).
4. **The flow then ran — and produced an empty CV.** Zero experience, zero
   education, no contact, no summary, from a source stating two jobs, a degree
   and full contact details. The verifier had applied ADR-013 literally: the
   model wrote `2019 - Present` where the source says `Since 2019`, the strings
   did not match, and a real job was deleted — immediately after the verifier
   had raised the right question about it (ADR-022).
5. **Attacking the fix found the deeper defect, three times.** Invented
   organisations were caught by a hard-coded list of famous companies; the
   closed-world replacement leaked on names with an internal capital, uncased
   scripts and numerals written as words, while deleting "Strong Communication
   skills" and "Python 3". Three adversarial rounds, each fixing the last and
   opening more (ADR-023, ADR-024).

## The decision that ended it

ADR-025 stopped the loop by changing what is promised rather than patching the
mechanism again: **prose asks, structure drops.** A structured claim — an
employer, an institution, a skill, a contact field — is grounded in a cited
fact or it is gone. Prose is flagged where the user will see it and never
deleted. `verify-entities.ts` went from 226 lines to 96.

It is also what the brief asked for in the first place: *"anything missing or
vague becomes a question to the user"*. We had read that as licence to delete.

## Cost, and what it bought

Five ADRs and three amendments. Three of the five defects were invisible to 822
passing tests, and the other two were defects in decisions this project had
already made and reviewed. The adversarial reviewer found four of the five.

The stopping rule that ADR-025 applies is now in the framework template as a
threshold rather than a feeling, together with the five other process changes
this sprint paid for.

## Open, and deliberately not fixed

- Prose carries the weaker guarantee by design, and the known limits are listed
  in ADR-024 and ADR-025 rather than hidden.
- A skill written as an alias of a cited fact ("JS" against "JavaScript") is
  dropped with a question. No alias dictionary: this sprint cost three rounds
  learning what closed lists cost.
