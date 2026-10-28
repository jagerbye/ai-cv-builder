# decisions.md — architecture decision records (ADR)

> **What this file is:** append-only log of decisions already made, so a new
> session does not re-litigate them. Without this file, every fresh agent
> "helpfully" proposes to rewrite what was chosen on purpose. An agent that
> wants to act against an ADR must stop and escalate to the owner instead.
> **Who writes it:** Architect (technical), Orchestrator (framework/process/product).
> **Who reads it:** anyone about to make or question a design choice.

Format — newest on top, one block per decision:

```
## ADR-NNN: <title>  (YYYY-MM-DD, status: accepted|superseded by ADR-MMM)
- **Context:** what forced a choice.
- **Decision:** what we chose.
- **Alternatives rejected:** A (why not), B (why not).
- **Consequences:** what this commits us to.
```

---

## ADR-009: Jira is virtual, and the Orchestrator commits (2026-10-28, accepted)

- **Context:** the owner has no Atlassian instance for this task and asked for
  the tracker to be imagined. Separately,
  `framework/process/task-lifecycle.md` makes pushing the owner's act and
  forbids agents from committing — a rule written for a team working against a
  shared remote, which does not fit a single-person test task where the
  deliverable is explicitly "a repository with a readable commit history".
- **Decision:** (1) the tracker is `framework/sprints/board.md`, key `CVB`,
  maintained by the Orchestrator with the same honesty rule as a real mirror —
  a status may never be ahead of local reality; (2) the Orchestrator commits,
  one commit per completed task, after the gate is green and the review is
  approved. Sub-agents still never commit: they write code and lane reports,
  the Orchestrator turns a finished task into a commit. Nothing is pushed
  anywhere until the owner says so.
- **Alternatives rejected:** letting each lane agent commit (an unreadable
  history of half-tasks, and merge order stops being the Integrator's
  decision); one commit per sprint (hides the TDD loop that the history is
  supposed to show); a real Jira (nothing to connect to).
- **Consequences:** the staging half of `task-lifecycle.md` does not apply —
  there is no deployment, so `Ready for test` means "merged and green" and QA
  runs locally against `docker compose up`. The `jira:` line in lane reports
  refers to a `CVB-N` row in `board.md`. Commit messages carry the issue key
  and say what changed; no hashes are quoted in reports.

## ADR-008: Framework ceremony is trimmed to three sprints, QA once per UI sprint (2026-10-28, accepted)

- **Context:** the framework is built for long-lived products; this is a test
  task with a 10-hour human reference budget. Full ceremony (discovery, PO,
  skeptic, per-sprint retro) would cost more than the build.
- **Decision:** skip `/discovery` and `framework/docs/product/` except
  `assumptions.md`; one designer pass for tokens; three sprints of ≤3 lanes;
  manual QA after sprints 2 and 3 only; one `/retro` at the end.
  Everything else — tests-first, gate.sh, docs-sync, ADRs, lane isolation —
  stays, because those are what the evaluation actually looks at.
- **Alternatives rejected:** full ceremony (process cost ≈ build cost);
  `/implement-feature` with no sprints at all (loses lane parallelism and the
  written record that demonstrates ownership of AI-generated code).
- **Consequences:** `framework/docs/product/vision.md`, `competitors.md` and
  `feature-map.md` stay as template stubs on purpose — a reader should not
  mistake them for abandoned work; this ADR is the reason.

## ADR-007: Session cookie, not a JWT (2026-10-28, accepted)

- **Context:** F-001 needs login that survives reloads and works from any
  device; the brief rules out OAuth and password reset.
- **Decision:** opaque random session id in an `httpOnly`, `SameSite=Lax`
  cookie; the hash of the id is stored in `sessions` with an expiry; logout
  deletes the row.
- **Alternatives rejected:** JWT in `localStorage` (XSS-readable, and the
  "log out everywhere" story becomes a revocation list anyway); JWT in a
  cookie (same cookie work, plus key management, for no gain at this size).
- **Consequences:** one extra DB read per authenticated request — irrelevant
  locally; revocation is a `DELETE`.

## ADR-006: Anthropic calls use tool-use with strict schemas, and output is treated as untrusted (2026-10-28, accepted)

- **Context:** the brief evaluates handling of untrusted input "including LLM
  output". Free-text parsing of model responses is the classic failure.
- **Decision:** both LLM stages use the Anthropic SDK's tool-use with an
  explicit input schema and `tool_choice` forcing that tool; the response is
  then re-validated in code against the same schema (never trusting that the
  provider enforced it). One retry with the validation error appended, then
  the job fails. Model id lives in config (`ANTHROPIC_MODEL`, default Sonnet
  5.5), so swapping models is not a code change.
- **Alternatives rejected:** "respond in JSON" prompting + `JSON.parse` (breaks
  on prose preambles and markdown fences); streaming partial parse (complexity
  with no user-visible gain, since the UI shows stages, not tokens).
- **Consequences:** schemas are duplicated as a single source (zod → JSON
  Schema) shared by the tool definition, the validator and the TS types.

## ADR-005: Server-side PDF via @react-pdf/renderer, not headless Chrome (2026-10-28, accepted)

- **Context:** F-007 demands A4 with selectable text, and the image must stay
  small enough that `docker compose up` on a clean machine is quick.
- **Decision:** render with `@react-pdf/renderer` in the api process; embed a
  Unicode-capable font (DejaVu/Noto subset) so Cyrillic and diacritics work.
- **Alternatives rejected:** Puppeteer/Chromium (≈400 MB in the image, slow
  cold start, fonts still need solving); client-side jsPDF with `html2canvas`
  (produces a raster — fails the selectable-text criterion outright);
  server-side LaTeX (absurd dependency for one template).
- **Consequences:** the CV template is React components with a constrained
  style subset, not HTML/CSS; pagination is the library's, which is why F-007
  tests for clipping explicitly.

## ADR-004: Postgres is the queue — SELECT … FOR UPDATE SKIP LOCKED (2026-10-28, accepted)

- **Context:** F-003 needs durable, reload-proof background work, and the
  constraint list allows no Redis or broker.
- **Decision:** `generation_jobs` table; an in-process worker loop leases rows
  with `FOR UPDATE SKIP LOCKED`, writes a `leased_until`, and renews it; a
  lease that expires is reclaimed and retried once.
- **Alternatives rejected:** BullMQ/Redis (new infra service, forbidden by the
  constraint list); in-memory `setTimeout` (a restart loses the job — exactly
  the failure F-003 exists to prevent); doing it in the request (the brief
  names the frozen screen as a failure).
- **Consequences:** one worker per api container; scaling out is possible but
  unneeded. The lease logic needs its own tests (dead-worker reclaim).

## ADR-003: Job state lives in the database, the browser polls (2026-10-28, accepted)

- **Context:** "reloading the page must not lose the work in progress".
- **Decision:** the job row is the only state; `GET /api/jobs/:id` returns
  status + a named stage; the SPA polls every 2 s with TanStack Query and
  rebuilds the progress view from the server on mount.
- **Alternatives rejected:** WebSockets/SSE (a connection to manage, and a
  reload still has to re-fetch state — so the server-state path must exist
  anyway; SSE may be layered on later for latency, never as the source of
  truth); `localStorage` progress (lies after a restart, invisible to a
  second device).
- **Consequences:** progress is coarse (3 named stages, no percentage) — which
  is also the honest thing to show.

## ADR-002: Groundedness is a three-stage pipeline with a deterministic verifier (2026-10-28, accepted)

- **Context:** "The AI may rephrase and restructure, but must not invent
  facts." This is the product's core promise and the main evaluation criterion.
  A prompt that says "do not invent" is unverifiable and therefore worthless as
  an engineering answer.
- **Decision:** (1) **extract**: the model turns the source into atomic facts,
  each carrying the verbatim `sourceQuote` it came from; (2) **compose**: a
  second call builds the CV from the *fact list only* — it never receives the
  source text, so it has nothing to embroider; every item cites `factIds`;
  (3) **verify**: ordinary code checks that each item's cited facts exist and
  that every organisation, date, number and named technology in the item's text
  occurs in one of those facts. Failures are dropped and become questions
  (F-005). The user can see the source quote behind any line.
- **Alternatives rejected:** a single "write a CV from this, don't lie" call
  (nothing to check against); LLM-as-judge over the output (a second model's
  opinion is not evidence, and it doubles cost for a weaker guarantee — it may
  be added later as a *signal*, never as the gate); RAG/embedding similarity
  (approximate where an exact check is available).
- **Consequences:** two LLM calls per generation instead of one, so latency and
  cost roughly double — accepted, this is the feature. The verifier is the most
  test-dense module in the project and owns the adversarial golden fixtures.
  A legitimate rephrasing that the verifier cannot match degrades to a question
  rather than to a silent invention — the right direction to fail in.

## ADR-001: Project adopts ai-dev-framework as-is (2026-10-28, accepted)

- **Context:** the task is built by an orchestrated agent team; the framework
  template was copied into this repo on 2026-10-28.
- **Decision:** `CLAUDE.md` router, docs as source of truth, `gate.sh` as the
  single definition of green, model routing per
  `framework/process/model-routing.md`, sprints with disjoint lanes.
- **Alternatives rejected:** ad-hoc prompting (no record of decisions — and the
  brief explicitly evaluates whether the author can own AI-generated code).
- **Consequences:** `framework/scripts/gate.config.sh` must be filled before
  any lane runs, otherwise nothing is enforced; docs are updated in the same
  change as code.
