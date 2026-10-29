# HISTORY.md — chronological sprint log

> **What this file is:** the append-only, one-block-per-sprint history of the
> project: what shipped, what broke, how it was fixed, what went well or
> badly. Sprint folders hold the full detail (plan, lanes, qa-report,
> report); `framework/knowledge/` holds deduplicated lessons; THIS file is
> the narrative timeline a human or agent reads to understand "how we got
> here".
> **Who writes it:** Orchestrator appends one block at every sprint close
> (playbook §5). Never edited retroactively — corrections get a new line.

Format — newest on top:

```
## Sprint NN — <name>  (YYYY-MM-DD → YYYY-MM-DD)
- Shipped: <features, owner's language>
- Bugs/findings: <count by source: review, QA, incident> → <how resolved:
  in-lane / hotfix / backlog>, worst one in one line
- Went well: <one–two lines>
- Went badly / changed in process: <one–two lines, link E-NNN/P-NNN/ADR>
- Detail: framework/sprints/SPRINT-NNN-<name>/
```

---

<!-- Sprint blocks go here. -->

## Sprint 01 — skeleton-auth  (2026-10-28 → 2026-10-29)

- **Shipped:** the whole product end to end — sign up and sign in, feed it a
  PDF or free text, a durable job runs extract → compose → deterministic
  verify, the result is stored as a CV with its questions, you edit every
  field in the browser, answer a question beside the field it asks about,
  regenerate without losing your edits, and download an A4 PDF with a real
  text layer. 25 tasks across wave 0 (3), wave A (6 lanes, 15) and wave B
  (5 lanes, 7), plus the QA fix wave. 19 ADRs.
- **Bugs/findings:** 15 QA findings (4 blockers, 3 major, 2 minor, 6 visual)
  → all fixed over three fix rounds and two re-checks, none deferred; 3
  cross-lane defects found only by the union gate at integration (E-003) →
  fixed in-lane; 8 errors recorded (E-001…E-008). Worst one: the shipped web
  container had no route to the api at all — no vite proxy, bare `vite
  preview`, no reverse proxy — so nobody could sign in, while 691 tests were
  green (QA-01 / FF-15).
- **Went well:** frozen contracts before wave A bought six-lane parallelism
  with zero cross-lane code conflicts — the only collisions were tests, never
  implementations. Every "flake" in the sprint turned out to have a mechanical
  cause; none was randomness. Zero capability escalations: after `blockedOn`
  was added (FF-11) every stuck lane returned a question, and each question
  became an ADR rather than an improvised rule.
- **Went badly / changed in process:** four separate incidents (E-002, E-004,
  E-005, E-008) were one cause — the suite sharing a database with the app —
  and each was fixed on its own before anyone saw the shape; E-004 alone cost
  a day disguised as a flake. Fixed structurally by ADR-019 (the suite gets
  its own database) and by this retro's P-002 / E-009. The union gate was
  green while the product could not be opened: the gate grew a sixth smoke
  step that drives the real stack over HTTP (P-003), and the stub-test rule
  became a mutation the reviewer performs and records (P-004, playbook §3).
- **Final state:** gate green on 10 of 10 consecutive serial runs —
  api 587 passed / 5 skipped, web 220, smoke 11.
- **Detail:** framework/sprints/SPRINT-001-skeleton-auth/

## Sprint 02 — live-model  (2026-10-29 → 2026-10-29)

**Shipped.** The whole flow on a real model: register → free text → job →
grounded draft with questions → answer → manual edit → A4 PDF with a text
layer. Six issues, five ADRs, three amendments.

**Bugs and findings.** Five defects, each hidden behind the previous one. A
hard-coded endpoint; one number serving as both the response cap and the spend
bound; a ledger called "optional" that left one path unbounded; a verifier that
deleted real jobs because the model reformatted a date; and invented
organisations being caught by a list of famous company names.

**What went well.** The adversarial reviewer found four of the five, twice by
probing the running stack rather than reading the diff — including a 200 OK
that silently deleted a user's phone number. A developer refused to rewrite a
red prompt-injection fixture without sign-off, which is the difference between
tests that are green and tests that mean something.

**What went badly.** Three rounds on one component before the orchestrator
re-scoped instead of patching. The stopping rule exists now because of it. And
the framework's planning stages — analyst, owner, manager, teamlead — produced
a sound specification that could not have caught any of this: every defect
lived at runtime or in a seam, and the only cure is to run the thing early.

**After the first close, the sprint kept going, and that is the real story.**
Two more source texts — a sparse one with no dates or company names, a messy
one contradicting its own dates — ran all seven steps. Then the owner asked for
the guarantee to be signed off, so it was ATTACKED instead of reviewed, and
three sentences the spec promises turned out false: a question numbered against
the drafted arrays landed beside a surviving entry once anything was dropped;
"a cited fact must name it" was a substring test, so MIT was grounded by
"Submitted 40 patches"; and answering a priority-1 question restored nothing.
ADR-027 fixed all three, ADR-028 closed the word boundary by enumerating every
separator, and ADR-029 came from the first full run on that build failing on a
retry policy that satisfied the spec's wording with a 500 ms base.

**Final state.** Gate green including the smoke step: api 811, web 251, smoke
11. The whole flow verified on a live model four times, the last one on the
build carrying every fix above. Navigation and a progress stepper added; the
facts screen shows the verbatim quote behind every generated line. 42 issues,
all Done, including CVB-12 — the groundedness guarantee — closed on the owner's
word once the confirmation pass stopped finding breaks.
