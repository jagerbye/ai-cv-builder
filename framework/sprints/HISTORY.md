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
