# board.md — the virtual Jira

> **What this file is:** this project's issue tracker. There is no Atlassian
> instance: the owner asked for Jira to be imagined, so the mirror lives here
> as a file (ADR-009). Everything `framework/process/task-lifecycle.md` says
> about "the Jira mirror" applies to this table — including the rule that the
> mirror may never be ahead of local reality.
> **Who writes it:** PM (issues, order), Orchestrator (status transitions,
> worklogs at task close). **Who reads it:** the owner, session start.

- **Project key:** `CVB` · **Board:** SPRINT-001 (re-planned into two waves, ADR-011)
- **Assignee for everything:** the owner (single-person project)
- **Worklog unit:** the `time:` line from the lane report, per role
- **Statuses:** `To Do → In Progress → In Review → Ready for test → Done`.
  There is no staging in this project (architecture.md §5), so
  `Ready for test` means "merged into main and covered by the gate", and QA
  happens locally against `docker compose up`.

## Sprint 001 — wave 0 (foundation, blocking)

| Issue | Task | Lane | Summary | Status | Est |
|---|---|---|---|---|---|
| CVB-1 | T-01 | 01 | Scaffold, workspaces, real lint and bundler | Done | 2h |
| CVB-2 | T-02 | 01 | Compose stack, seven-table schema, health | Ready for test | 2h |
| CVB-24 | T-07 | 01 | Route registry and cross-lane interfaces | Done | 1h |

## Sprint 001 — wave A (six lanes in parallel)

| Issue | Task | Lane | Summary | Status | Est |
|---|---|---|---|---|---|
| CVB-3 | T-03 | 02 | Registration, argon2id, error envelope | Ready for test | 2h |
| CVB-4 | T-04 | 02 | Login, session cookie, ownership guard | Ready for test | 2h |
| CVB-5 | T-05 | 03 | Web shell, API client, mobile layout | Done | 2h |
| CVB-6 | T-06 | 03 | Auth screens, session restore | Done | 2h |
| CVB-13 | T-13 | 03 | Intake screen | Done | 2h |
| CVB-14 | T-14 | 03 | Progress view, reload-safe | Done | 2h |
| CVB-9 | T-09 | 04 | Anthropic gateway, schema validation, retries | Done | 2h |
| CVB-10 | T-10 | 04 | Extract stage, verbatim quotes | Done | 2h |
| CVB-11 | T-11 | 04 | Compose stage, facts only | Done | 2h |
| CVB-12 | T-12 | 07 | Verifier, questions, golden fixtures | Ready for test | 3h |
| CVB-7 | T-15 | 05 | Intake: PDF and free text, all rejections | Done | 3h |
| CVB-8 | T-16 | 05 | Durable jobs, lease, reclaim, timeout | Done | 3h |
| CVB-15 | T-17 | 06 | CV read, list, delete | Done | 2h |
| CVB-16 | T-18 | 06 | PATCH, optimistic concurrency, userEdited | Done | 2h |
| CVB-18 | T-19 | 06 | PDF export, A4, real text layer | Done | 3h |

| CVB-25 | T-24 | — | Design tokens and spec for this product | Done | 1h / 0:05 |

**Lane 04 is the critical chain** — CVB-9 → 10 → 11. CVB-12 was moved out to
lane 07: the verifier is a pure function over frozen types and never needed the
LLM stages. CVB-25 ran outside the lanes entirely (designer, Fable) and is done.

**Unscheduled scope found by CVB-25, resolved 2026-10-28:**
- ~18 inline SVG icons → **cut to one** (`trash`). Everything else became the
  text it was decorating. The rule that keeps the list from regrowing is in
  `design.json` → `icons.rule`.
- Question-column alignment (offsetTop + ResizeObserver) → **kept**: without
  it the question-attached-to-a-field pattern does not work, and that pattern
  is the product's one visual idea.
- `prefers-reduced-motion` block → **kept**: one media query at the root.

**Wave 0 and wave A are complete — 18 issues, every one reviewed and approved
against its lane-scoped gate.** `Ready for test` here means merged into main
and covered by the gate; there is no staging on this project (ADR-009), so QA
runs locally against `docker compose up`. Integration of the union is in
progress; two cross-lane conflicts were found that no lane gate could catch —
a T-05 test that pinned the temporary empty-placeholder state of the web route
modules, and a `.env.example` strictness test that predates `WEB_PORT`.

Added during the wave, not in the original plan:
| Issue | Task | Summary | Status | Est |
|---|---|---|---|---|
| CVB-27 | T-24 | Align the toolchain pin test with ADR-012 (Node 24) | Done | 0.5h |

## Sprint 001 — wave B (after wave A is integrated)

| Issue | Task | Lane | Summary | Status | Est |
|---|---|---|---|---|---|
| CVB-17 | T-20 | 07 | Answer → user fact → section-scoped recompose (C-009) | Done | 3h |
| CVB-29 | T-26 | 07 | Regenerate, userEdited survives (C-010) | Done | 2h |
| CVB-19 | T-21 | 08 | Rate limits, error envelope installed, one session guard | Done | 2h |
| CVB-15b | T-22 | 09 | CV editor: every field, add/delete/reorder, version | Done | 3h |
| CVB-30 | T-27 | 09 | Questions beside the fields they ask about | Done | 2h |
| CVB-20 | T-23 | 10 | README and clean-clone verification | Done | 2h |
| CVB-28 | T-25 | 11 | Job-queue test helper and its guard test (ADR-014) | Done | 1h |
| CVB-31 | T-28 | 12 | The worker persists what it generates, and the app starts it | Done | 3h |

**CVB-31 is scope nobody wrote down.** `core/jobs/worker.ts` runs extract →
compose → verify and then writes only the job row; its own comment says "the
verified result is persisted by core/cv", and no such write exists. Nothing
starts the worker either. So generation has never produced a stored CV — the
hole was invisible until T-26's regenerate test asserted that the old employer
was gone after the worker ran, and it was not. The README already says
generation does not run end to end; this is the task that makes that sentence
false.

**Wave B is complete — seven issues, each reviewed and approved, union gate
green on three consecutive full runs (api 534 + web 157).** The three defects
that only the union could see are in the sprint report: two tests that pinned a
sibling lane's temporary shape, and one "flake" that turned out to be a
reproducible failure hidden by a silent catch in the worker (E-004).

**C-010 regenerate was frozen in sprint 3's contracts and implemented by no
wave-A lane** — `core/cv/merge.ts` exists for it, the route does not. It joins
lane 07 as T-26 rather than becoming its own lane: it is a mutation on one CV
that re-runs generation while `userEdited` fields survive, and it lives in
`routes/cvs.ts`, which exactly one lane may own.

**Statuses as of 2026-10-29:** everything the sprint built is `Done` — merged,
covered by the gate, and re-checked by the QA pass. Four issues are held at
`Ready for test` on purpose because they carry the `critical` label and this
project's own process says the owner confirms their final transition; CVB-12 in
particular is the groundedness guarantee, which ADR-022 is changing right now.
The live-key block (CVB-39…44) waits for the end-to-end re-run.

**Labeled `critical`** (need the owner's explicit yes before their final
transition): CVB-2 (migrations), CVB-3, CVB-4 (auth and authorization),
CVB-12 (the groundedness guarantee).

## Framework work

| Issue | Backlog | Summary | Status | Est |
|---|---|---|---|---|
| CVB-26 | B-024 | Harvest this build into the ai-dev-framework template | Done — 2026-10-29, three passes, 39 files | 2h |

Nine findings are already logged with evidence in
`framework/knowledge/framework-feedback.md` (FF-01…FF-06): the runner ignoring
a reviewer's fix-list, FAST_CHECK blocking the first agent of any new project,
design.json shipping as another product's tokens, the dependency list not
covering the toolchain, worktree Mode B not being implementable as written, and
the bootstrap-task pattern missing from the playbook, check-lane being blind to
untracked files, lane allowlists that fail their own task, and "free the port"
as a remedy on a shared machine. Entries are added when hit, not reconstructed
later; they are APPLIED once, at project end (owner's decision 2026-10-28).

## Sprint 001 — QA stage 4.5 and the fixes it forced

| Issue | Finding | Severity | Status |
|---|---|---|---|
| CVB-32 | QA-01 the browser had no route to the api at all | blocker | Done |
| CVB-33 | QA-02/03/09 no front door, a list that never fetched, sign-in losing the destination | blocker | Done |
| CVB-34 | QA-04 a 503 left the client on a stale version and locked all saving | blocker | Done |
| CVB-35 | QA-05/15 question paths, and cards placed in API order instead of their fields' | major | Done |
| CVB-36 | QA-06/07/08/11/12/13 clipped text, overlapping header, native controls, four containers | visual | Done |
| CVB-37 | QA-10/14 a failed job left the CV generating, and nothing reconciled a crash | major | Done |
| CVB-38 | ADR-019 the suite stops sharing a database with the app | — | Done |

**QA found what 691 green tests could not**, and that is the sprint's most
useful result: the api suites call the server in-process and the web suites
mock fetch, so nobody ever opened the product. Two rounds of re-check later all
fifteen findings are fixed, the gate has a sixth step that loads the real app
over HTTP, and the gate passes **10 of 10 consecutive serial runs**.

## After the sprint closed — the live key

The owner supplied a key for an Anthropic-compatible endpoint, so the one thing
this build had never done became possible: calling a real model. Everything
below was found by doing it, and nothing below could have been found any other
way — every item is a defect the mocked seam cannot express.

| Issue | Summary | Severity | Status |
|---|---|---|---|
| CVB-39 | ADR-020 the answer path reported a missing key as "try again later" | major | Ready for test |
| CVB-40 | The gateway hard-coded the endpoint, so no key could be pointed at it | blocker | Ready for test |
| CVB-41 | ADR-021 one number served as both the output cap and the spend budget, and compose crossed it on every real CV | blocker | Ready for test |
| CVB-42 | ADR-021 Amendment A — "optional ledger" left the answer path with no spend bound at all | major | Ready for test |
| CVB-43 | The vendored method was older than the template its own findings were harvested into | major | Ready for test |
| CVB-44 | ADR-022 the verifier deleted the jobs it had just asked about; contact was never composed | blocker | In Progress |

**CVB-44 is the most expensive thing a mock could never have told us.** The
first full run produced a CV with zero experience, zero education, no contact
and no summary — from a source stating two jobs, a degree and full contact
details. Extract was perfect. The verifier applied ADR-013 literally: the model
wrote `2019 - Present` where the source says `Since 2019`, the strings did not
match, and a real job was deleted — right after the verifier had raised exactly
the right question about it.

## Parked

| Issue | Backlog | Summary | Why parked |
|---|---|---|---|
| CVB-21 | B-021 | SSE progress instead of polling | ADR-003 keeps polling as the source of truth |
| CVB-22 | B-022 | Source-quote popover per line | data already exposed by C-006; UI only |
| CVB-23 | B-023 | Session expiry sweep | irrelevant without a deployment |

## Done

<!-- Issue | Task | Merged | Logged — newest first -->
