# How this was built, and how to check it

> **For a reviewer — human or agent.** `README.md` describes the product. This
> file describes the process that produced it, with the numbers behind every
> claim and the path to the artifact that proves it. Nothing here asks to be
> believed: every line names a file or a command.

## The short version

Two sprints. One engineer orchestrating; no product code written by hand. An agent team
worked from a specification, in parallel lanes, against a single mechanical
definition of "green". The method lives in `framework/`, vendored into this
repository so it can be read — and it was amended **from this build's own
failures** before the project closed.

## Measured, not estimated

| | | Where it comes from |
|---|---|---|
| Working time | **≈8.8 h** across two sessions | `git log`: 18.9 h calendar span minus a 9.1 h overnight gap and a 1.0 h gap. The brief budgets 10 human hours |
| Commits | 81 | `git log --oneline \| wc -l` |
| Product + test code | ~24 800 lines TS/TSX | `git ls-files 'api/src/*' 'web/src/*' 'tests/*' 'scripts/*' \| grep -E '\.tsx?$' \| xargs wc -l` |
| Specification and process docs | ~7 100 lines | `git ls-files 'framework/*' \| grep '\.md$' \| xargs wc -l` |
| Test files | 99 | `git ls-files '*.test.ts' '*.test.tsx' \| wc -l` |
| Tests | 826 api + 251 web + 11 smoke, 1 skipped | the three commands under **Tests** in `README.md` |
| Agent runs (second session only) | **121**, ~9.8 M output tokens | counted from the runner scripts before they were deleted; see `.claude/workflows/README.md` |

The orchestrator (strongest model) never wrote product code: it planned,
decided, and verified. Implementation ran on the cheapest model that could do
the job — Haiku for tests, code and review, Sonnet only on a retry or a fix
pass, the strong model only for architecture, integration and final
verification. The routing rule is `framework/process/model-routing.md`.

**What this file claimed before, and does not now.** An earlier revision put
working time at ≈6 h and commits at 60: both were true when written and neither
was corrected as the work went on. The same revision of `README.md` said in one
section that the whole flow had run on a real model and in another that no
Anthropic call had ever been made. A document that asks to be checked against
`git log` has to be re-checked against it, and the numbers above were taken
from the commands beside them on 2026-10-29, after the last commit.

## Review it in ten minutes

```bash
docker compose up -d --wait          # three containers, no other setup
bash framework/scripts/gate.sh       # database, typecheck, lint, every test, build, smoke
git log --oneline                    # one commit per finished task, messages say why
```

Then read, in this order — each is one page and each answers a question a
reviewer actually has:

1. `framework/sprints/board.md` — **the decomposition and its state**: 45
   issues, each with its lane, its estimate and its status, from the first
   scaffold task to the defects the live model found. `backlog.md` holds the
   items it was cut from, and
   `framework/sprints/SPRINT-001-skeleton-auth/plan.md` holds the dependency
   graph the parallel lanes were planned against.
2. `framework/docs/decisions.md` — **30 ADRs**, every one with the alternatives
   it rejected and why. This is where the design arguments are.
3. `framework/sprints/SPRINT-001-skeleton-auth/qa-report.md` — **15 findings**
   from a real browser, with severities and the status of each. The 55
   screenshots it cites are not in the repository: see the note at the top of
   that file.
4. `framework/knowledge/errors.md` — **15 entries**: symptom, cause, and the
   rule that came out of it.
5. `framework/knowledge/framework-feedback.md` — **16 entries**: what the method
   itself got wrong on its first real use.

## What a reviewer should actually look at

Six moments where the process produced something a straight-through build
would not have — and one where it did not. Each is checkable.

**An agent wrote itself a decision, and it was rejected.** A developer hit a
contradiction in the groundedness rule and wrote an ADR marked "accepted" that
relaxed it. The diagnosis was right and was kept; the resolution was wrong — it
permitted assembling an entry from two unrelated facts, every token real and
the combination invented — so the contract changed instead.
→ `framework/docs/decisions.md` ADR-013.

**691 passing tests while the product could not be opened.** The gate was green
on three consecutive full runs. Manual QA found that the web container had no
route to the API at all: every `/api/*` call from a browser was answered by the
SPA's own HTML with 200. Neither test level could see it — the API suites call
the server in-process, the web suites mock `fetch`, and nothing instantiated the
seam between them. The gate now has a sixth step that opens the product over
real HTTP.
→ `framework/knowledge/framework-feedback.md` FF-15, `tests/smoke/`.

**Four "flakes" with one cause.** Four incidents, four correct local fixes — a
suite lock, a leak guard, a cleanup rule, a "run one gate at a time" note —
before anyone noticed they were one defect: the test suite shared a database
with the running application. The error log is grepped by symptom by design, so
four different error texts never met. The fix is structural (ADR-019) and the
lesson is now a rule: an entry whose fix adds a coordination mechanism names
the contended resource, and a second hit on that resource is an isolation
decision, not a third entry.
→ `framework/knowledge/errors.md` E-002, E-004, E-005, E-008 and
`framework/knowledge/patterns.md` P-002.

**A test that asserted nothing, caught by deleting the code under it.** The
review rule is not "read the test and judge it" but "delete the line the test
exists for, run it, require red, restore, record the mutation". It found an
assertion whose subject could be removed with the suite staying green, and two
tests that were pinning a defect rather than preventing it.
→ `.claude/rules/testing.md`; the reviewer reports are in `git log` (the lane
logs were deleted at close, see `.claude/workflows/README.md`).

**Five defects in a chain, each hidden behind the one before it.** The whole
pipeline had been proven against a mocked seam. The first real call failed and
the failure was ours — one setting serving as both the output cap and the spend
bound. Fixing it let the flow run one stage further, where it produced a CV
with no experience, no education and no contact at all: the verifier had
deleted real jobs because the model wrote `2019 - Present` where the source
says `Since 2019`. Fixing that exposed that invented organisations were being
caught by a hard-coded list of famous company names. Three adversarial rounds
later the answer was to change the promise rather than patch the mechanism
again — prose asks, structure drops — and the checker lost 130 of its 226
lines. A mocked seam cannot be walked past.
→ ADR-020 through ADR-025, and `framework/sprints/SPRINT-002-live-model/report.md`.

**And one the process did not catch: a CV with no name on it.** Every rule
above was followed. 1,062 tests passed, nine adversarial golden fixtures
agreed, a manual QA pass had signed the screen off — and a live run produced a
CV whose header was the target role, because the extract stage missed a name
standing alone on the first line and the verifier's contact loop iterates the
fields the draft HAS. An absence is invisible to a check written as a loop over
output, and the golden fixtures, written against that code, pinned the blind
spot as correct. Nothing in the method would have found this; running it on one
more source did. It is the clearest evidence here for the brief's actual
question — whether the author can review AI-generated code rather than ship it
— and the honest answer is that the review that found it was a fourth live run,
not a reading.
→ ADR-030, `framework/knowledge/errors.md` E-014, and
`api/src/core/generation/verify.required-contact.test.ts`.

## The method, and the part that is unusual

The loop per task: a test-engineer agent writes failing tests from the
acceptance criteria, a developer agent makes them pass, a reviewer agent checks
the diff and runs the gate itself. Parallel lanes own disjoint file sets, and
`framework/scripts/check-lane.sh` proves it mechanically instead of trusting it.

Two things are worth a reviewer's attention:

**Escalation is a signal, not a retry.** A failing agent reports *why* it is
stuck — `code | brief | decision | dependency` — and only a capability failure
earns a stronger model. Everything else returns to the orchestrator, because a
second model reading the same defective brief pays twice to be told the same
thing. The evidence: across both development waves and three QA fix rounds,
**not one task came back `blockedOn: code`**. The ladder's capability rung went
unused, and four blocks became architecture decisions.

**The method amended itself from this build.** Every time the process cost
something, the cost was written down against the template file that caused it.
At project end those sixteen findings were ported back in one pass — the
template is at `~/Desktop/www/ai-dev-framework`, now under version control
specifically so the harvest is a reviewable diff: **39 files, +1313 −280**. Two
of the three passes were needed because the first changed every document
describing the runner without changing the runner, and the second fixed a
script and left its old usage in the two files an agent reads first. The lesson
recorded: *a fix is not applied until the thing it fixes stops happening inside
the fix.*

## What is not done

Stated here as well as in the README, because a summary that only lists
strengths is not a summary.

- One container test is skipped until the API image is built.
- Facts are stored and served with their verbatim source quotes, and no screen
  shows them yet — the cheapest remaining feature.
- The end-to-end browser flow is covered by a manual QA pass and a smoke check,
  not by an automated browser test.
- Backlog items B-021…B-023 are parked, with the reason on the board.
- Completeness is checked for two contact fields only (ADR-030). An experience
  list the extract stage lost still reads as a thin CV, not as a question.
