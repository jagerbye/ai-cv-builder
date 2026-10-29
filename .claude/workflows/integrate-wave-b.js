// integrate-wave-b.js — the union run after five lanes.

export const meta = {
  name: 'integrate-wave-b',
  description: 'Integrate wave B: resolve the union failure, run the full gate, write the integration notes',
  phases: [{ title: 'Integrate' }, { title: 'Verify' }],
}

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    report: { type: 'string', description: 'max 30 lines' },
    conflicts: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'report'],
}

const BRIEF = `You are the Integrator (.claude/agents/integrator.md). Project root: /Users/mike/Desktop/www/ai-cv-builder.

Wave B is finished: six tasks approved by their reviewers, each green on its own lane-scoped gate. The wave marker is removed, so framework/scripts/gate.sh now runs the UNION — typecheck, lint, every workspace's tests, build. I ran it once already. One test fails:

  web/src/app/routes.test.tsx:124 — "resolving a cv path yields a component that renders the real cv screen"
  AssertionError: cv screen marker: expected null not to be null

Diagnosis, confirmed before handing this to you: SCREEN_MARKER.cv is 'h1'. T-05 wrote that test when web/src/features/cv/route.tsx was a placeholder that always rendered an <h1>. T-22 replaced the placeholder with the real editor, and the registry test mounts the route with fetch stubbed to a 404 envelope, so the component is in its pending state — which renders only <p className="cv-message">Loading the CV…</p>. No heading, no landmark.

This is the same class of conflict wave A hit twice: a test that pinned a temporary structure, true when written and false the moment the owning lane did its job. It cannot be caught by a lane gate, because the test and the component belong to different lanes.

Resolve it the way wave A's conflicts were resolved — by making the invariant real, not by deleting it:
- The registry test's subject is "this route resolves to a component that renders its actual screen". That invariant is worth keeping; it is what stops a route regressing to an empty placeholder.
- The cv screen's pending and error states having no heading is a defect in its own right: a user who lands on /cvs/<id> and whose request is slow or fails gets a screen with no title, and a screen-reader user gets nothing to orient on. Fix it in web/src/features/cv/route.tsx — every state of that screen renders a heading — rather than loosening the marker.
- If the editor's loaded state has no h1 either, say so and fix that too.
- Do not weaken any assertion anywhere. If you conclude a test is genuinely wrong rather than the code, fix it and record the reason in the integration notes, as the testing rule requires.

Then:
1. Run the full gate: bash framework/scripts/gate.sh (no GATE_LANE_TEST, no wave marker). It must end "gate ✓ all green". Report the exact test counts for api and web.
2. Check the union for the cross-lane hazards this wave created, and say in the report whether each holds:
   - the job suites share one database and tests/contract/generation-persist-lease.test.ts calls clearOpenJobs(), which deletes every non-terminal generation_jobs row. It is safe only because the suite lock serialises job suites. Run the api suite twice and say whether it is stable.
   - the rate limiter is one global in-process hook; contract suites that make many writes reset it. Confirm no suite other than cvs-create needs the reset.
3. Write the integration notes into framework/sprints/SPRINT-001-skeleton-auth/report.md under a wave B section: what you changed and why, each conflict, and anything you found that no lane owns.

Do not commit — the Orchestrator commits. Report at most 30 lines.`

const integrated = await agent(BRIEF, { label: 'integrate', phase: 'Integrate', model: 'fable', schema: RESULT })

const verified = await agent(
  'You are the code-reviewer (.claude/agents/code-reviewer.md). Project root: /Users/mike/Desktop/www/ai-cv-builder.\n\n' +
  'The Integrator resolved wave B\'s union failure and reported:\n' + (integrated ? integrated.report : '(no report)') +
  '\n\nYour step, independently: run bash framework/scripts/gate.sh yourself and report the exact outcome and test counts. Then read the change the Integrator made to web/src/features/cv/route.tsx and web/src/app/routes.test.tsx (git diff) and answer one question concretely: does the registry test still fail if the cv route regresses to an empty placeholder, and does it still fail if the real screen renders nothing? If either answer is no, the invariant was lost and you say so. Do not fix anything. Report at most 20 lines.',
  { label: 'verify', phase: 'Verify', model: 'haiku', schema: RESULT })

return { integrated, verified }
