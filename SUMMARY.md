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
| Working time | **≈6 h** across two sessions | `git log`: 15.3 h calendar span minus a 9.1 h overnight gap. The brief budgets 10 human hours |
| Commits | 60 | `git log --oneline \| wc -l` |
| Product + test code | ~21 400 lines TS/TSX | `find api/src web/src tests scripts -name '*.ts*' \| xargs wc -l` |
| Specification and process docs | ~7 950 lines | `find framework -name '*.md' \| xargs wc -l` |
| Test files | 86 | `find . -name '*.test.ts*' -not -path '*/node_modules/*'` |
| Agent runs (second session only) | **121**, ~9.8 M output tokens | the runner scripts in `.claude/workflows/` |

The orchestrator (strongest model) never wrote product code: it planned,
decided, and verified. Implementation ran on the cheapest model that could do
the job — Haiku for tests, code and review, Sonnet only on a retry or a fix
pass, the strong model only for architecture, integration and final
verification. The routing rule is `framework/process/model-routing.md`; whether
it held is checkable in the runner scripts, where every `agent()` call names
its tier.

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
2. `framework/docs/decisions.md` — **22 ADRs**, every one with the alternatives
   it rejected and why. This is where the design arguments are.
3. `framework/sprints/SPRINT-001-skeleton-auth/qa-report.md` — **15 findings**
   from a real browser, with 55 screenshots, severities and the status of each.
4. `framework/knowledge/errors.md` — **10 entries**: symptom, cause, and the
   rule that came out of it.
5. `framework/knowledge/framework-feedback.md` — **16 entries**: what the method
   itself got wrong on its first real use.

## What a reviewer should actually look at

Five moments where the process produced something a straight-through build
would not have. Each is checkable.

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
→ `.claude/rules/testing.md`, and the reviewer reports in the lane logs.

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

- Five container tests are skipped until the API image is built.
- Facts are stored and served with their verbatim source quotes, and no screen
  shows them yet — the cheapest remaining feature.
- The end-to-end browser flow is covered by a manual QA pass and a smoke check,
  not by an automated browser test.
- Backlog items B-021…B-023 are parked, with the reason on the board.
