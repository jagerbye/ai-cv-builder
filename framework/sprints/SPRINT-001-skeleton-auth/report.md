# Sprint NN — report

> **What this file is:** the sprint's outcome for the owner and for the next
> session. Written by the Orchestrator at close, after integration. Owner's
> language first, process details second. No commit hashes — say what
> changed; hashes live in git log.

## Shipped

<!-- Per feature, in the owner's words: what can the user/owner now do. -->

## Not shipped / returned to backlog

<!-- Item → one-line reason. Never silent rollover. -->

## Integration notes

<!-- Merge order, conflicts and how resolved, any ADRs born here. -->

**Wave A, 2026-10-28 (Integrator).** Mode A, one shared tree, no branches to
merge. Integration = removing `.wave-in-flight` and making the full union
gate (database, typecheck, lint, test, build) green. It started red with five
failing tests and one type error; it ends `gate ✓ all green` (api 426 passed /
5 skipped, web 99 passed). Three things only the union could show:

1. **Web route registry test pinned a temporary state (lane 03, T-05 vs
   T-06/T-13/T-14).** `web/src/app/routes.test.tsx` asserted that each
   feature route module "is an empty placeholder that renders nothing". That
   was true when T-05 wrote it and false by design once the three feature
   tasks filled the modules in. *Replaced, not weakened:* the four placeholder
   assertions became "resolving a <feature> path yields a component that
   renders the real <feature> screen" — each route is resolved from a concrete
   path, mounted inside a QueryClientProvider with the network stubbed
   (C-000 NOT_FOUND envelope; the only external), and must render a non-empty
   screen with its structural landmark (auth/intake: a form; generation: a
   status or alert; cv: a heading). The registry's real invariant — every
   declared route resolves to a component that renders — is now proven
   against production screens instead of stubs. All other T-05 assertions
   (one entry per feature, public/protected split, distinct paths, default
   export wiring, negative resolve cases) are unchanged.

2. **`.env.example` strictness test out of date with `WEB_PORT` (lane 01,
   T-02 vs the Orchestrator's compose change).** `api/src/db/stack-config.test.ts`
   "lists nothing else" pinned the key set to `ANTHROPIC_API_KEY, DATABASE_URL`;
   the Orchestrator added `WEB_PORT=5273` because host port 5173 is taken on
   the dev machine and compose now maps `${WEB_PORT:-5273}:5173`. *Corrected,
   not loosened:* the exact-set assertion stays exact and now includes
   `WEB_PORT`; a new assertion requires `WEB_PORT` to be a plain port number
   and `docker-compose.yml` to actually consume `${WEB_PORT…}`, so a stray or
   secret key still fails and a dangling key cannot be added silently.
   Owner-visible behaviour: the web container is reachable on
   `http://127.0.0.1:5273` by default (override with `WEB_PORT` in `.env`).

3. **Found by the union, not by any lane gate: queue-table race between T-15
   and T-16 (both lane 05).** `tests/contract/cvs-create.test.ts` commits
   `queued` generation jobs through the real `POST /api/cvs`; in the same
   parallel vitest run `api/src/core/jobs/jobs.test.ts`'s dead-worker reclaim
   test claimed one of those rows instead of its own (`expected <uuid> to be
   <uuid>` at jobs.test.ts:272). The lanes' gates ran each suite alone, so it
   never overlapped. This is the known E-002 class; fix follows its rule:
   `cvs-create` now takes `acquireJobSuiteLock()` as the fourth lock holder.
   No production code changed. Recorded as a recurrence under E-002 in
   `framework/knowledge/errors.md`.

**For the next wave:** any suite that commits a queued/running
`generation_jobs` row must hold the job-suite lock (or the Teamlead turns
`fileParallelism` off for api — still an open E-002 decision). The routes
test now mounts real screens, so a feature that adds a required provider or
mandatory prop to its route component will break the registry test on
purpose: that is the signal to update the registry contract, not the test.
No frozen contract was touched; nothing here needs an ADR unless the
Orchestrator wants the `WEB_PORT` default recorded.

## Process signals (feeds /retro)

- Escalations: <count + where>
- Briefs that needed rework: <which, what was missing>
- Errors recorded to framework/knowledge/: <count>

## Next sprint candidates

<!-- PM's input for the next planning. -->
