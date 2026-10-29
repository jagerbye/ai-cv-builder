# backlog.md — prioritized work queue

> **What this file is:** the PM's ordered list of what to build next, each
> item traceable to a spec feature. The top of this file + the current
> sprint plan = "the project's now" that every new session reads first.
> **Who writes it:** PM (order, sizing), BA (links to spec), owner decisions
> via Orchestrator. **Who reads it:** session start, sprint planning.

**Current sprint:** SPRINT-001-skeleton-auth (closed — see HISTORY.md); next: B-024 ·
**Last updated:** 2026-10-29

Format — ordered, top = next:

```
- [ ] B-NNN <title> — spec F-NNN, size S/M/L, value: <one line why now>
      blocked by: <B-MMM / contract C-NNN / owner question>
```

Sizes are human-reference hours, the unit the brief uses: S ≈ ≤1 h,
M ≈ 1–2 h, L ≈ 2–3 h. A task in a sprint plan is never larger than M
(`framework/process/sprint-playbook.md` §1).

## Queue

### Sprint 1 — walking skeleton and identity

- [x] B-001 Repo scaffold: TS workspaces (`api`, `web`), tsconfig, eslint,
      vitest, `npm run typecheck|lint|test|build`, CI green on an empty tree
      — spec §4, size M, value: nothing can be verified before gate.sh runs
- [x] B-002 Docker compose (`db`, `api`, `web`) + Prisma schema for all six
      tables + initial migration applied at container start — spec §4,
      database-schema.md, size M, value: `docker compose up` is the brief's
      only run target, so it exists from day one, not at the end
- [x] B-003 Register + password hashing + validation — F-001, C-001, size M
- [x] B-004 Login, session cookie, `requireUser`, `assertOwnership`, logout,
      `/me` — F-001, C-002, size M, value: every later endpoint depends on it
      blocked by: B-003
- [x] B-005 Web shell: Vite app, router, API client, error-envelope handling,
      design tokens, mobile-first layout — F-009, size M
- [x] B-006 Auth screens + protected routes + session restore on reload —
      F-001, size M, blocked by: C-002

### Sprint 2 — source in, grounded CV out

- [x] B-007 Intake: free-text and PDF, all rejection cases, text extraction,
      source persisted, binary discarded — F-002, C-003/C-004, size L
- [x] B-008 Job table, lease loop, status endpoint, reclaim, timeout,
      one-in-flight constraint — F-003, C-005, size L, value: the reload
      requirement is a named evaluation point
- [x] B-009 Anthropic gateway: tool-use calls, strict schema validation,
      retry classification, token budget, no-key boot — F-010, C-012, size M
- [x] B-010 Extract stage: source → facts with verbatim quotes, quote
      verification — F-004, size M, blocked by: B-009
- [x] B-011 Compose stage: facts + role → draft with factIds and relevance —
      F-004, size M, blocked by: B-010
- [x] B-012 **Verifier + questions**: deterministic groundedness check,
      drop-and-ask, golden adversarial fixtures — F-004, F-005, size L,
      value: this is the product; everything else is plumbing around it
      blocked by: B-011
- [x] B-013 Intake UI: free text / PDF tabs, target role, submit — F-002, size M
- [x] B-014 Progress UI: stage polling, reload-safe resume, failure + retry —
      F-003, size M, blocked by: C-005

### Sprint 3 — own it, export it, harden it

- [x] B-015 CV read/list/delete + editor UI with inline questions — F-006,
      F-008, C-006/C-007, size L
- [x] B-016 PATCH with optimistic concurrency, `userEdited` protection —
      F-006, C-008, size M
- [x] B-017 Answer a question → user fact → section-scoped recompose —
      F-005, C-009, size L
- [x] B-018 PDF export: A4 template, Unicode font, pagination, text-layer
      test — F-007, C-011, size L
- [x] B-019 Hardening: rate limits, error envelope everywhere, LLM failure
      degradation, config-missing path — F-010, size M
- [x] B-020 README (run, tests, architecture, anti-hallucination, cuts, AI
      usage) + `docker compose up` verified from a clean clone — deliverable,
      size M, value: the README is graded, not just read

### Framework work (not product — runs after the product is done)

- [ ] B-024 Harvest this build into the framework template — size M,
      value: this is the template's first real use, and the first sprint alone
      surfaced nine findings — four tool/template bugs, four gaps and one
      doc-versus-reality drift. Fixing them once, with evidence, is cheap;
      rediscovering them in the next project is not.
      **Runs at project end**, as a single pass — owner's decision, 2026-10-28:
      not at sprint close, not in pieces. Every wave and the QA pass will add
      entries, and a finding described after three recurrences is described
      better than one patched after the first. Nothing here is urgent, because
      every proven fix is already live in THIS repo's copy (`check-lane.sh`,
      `gate.config.sh` FAST_CHECK, `sprint.js` fix cycle, `design.json`) — the
      port helps the next project, not this one.
      Source of truth: `framework/knowledge/framework-feedback.md` (FF-NN,
      each with a template path:line or a lane report as evidence), plus
      whatever the final retro adds.
      Target repo: `/Users/mike/Desktop/www/ai-dev-framework`.
      Done when: every FF entry is either applied to the template or closed
      with a stated reason; the template's own `decisions.md` records what
      changed and why; `framework-feedback.md` has no `open` rows left.
      blocked by: project end — all waves merged, QA passed, final retro done

### Parked (explicitly cut unless time appears)

- [ ] B-021 SSE instead of polling for progress — ADR-003 says polling stays
      the source of truth; this is latency polish only
- [ ] B-022 "Show the source quote" popover on every bullet — the data is
      already exposed by C-006; only the UI is missing
- [ ] B-023 Session expiry sweep job — irrelevant locally

## Done (moved from queue, newest first)

<!-- - [x] B-NNN <title> — sprint NN -->
