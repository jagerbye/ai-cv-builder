export const meta = {
  name: 'final-three',
  description: 'Smoke cleanup points at the wrong database, one fixture still defaults to the app database, and two item kinds tie on orderIndex',
  phases: [{ title: 'Fix' }],
}

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 25 lines' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `You are the developer (.claude/agents/developer.md). Project root: /Users/mike/Desktop/www/ai-cv-builder.

ADR-019 landed — the suite runs against ai_cv_builder_test, the app keeps ai_cv_builder. The review found three things it left behind. Two are consequences of the move; the third is a real ordering defect that the move only made visible.

1. THE SMOKE SUITE NOW CLEANS THE WRONG DATABASE. tests/smoke/stack.smoke.test.ts drives the REAL stack over HTTP — that is its whole subject — so the users it registers land in ai_cv_builder. Its afterAll cleanup reads DATABASE_URL, which ADR-019 repointed at the test database, so it deletes nothing and leaves its users behind: 15 cvb-smoke-* users are sitting in the app's database right now. Give the smoke suite its own connection string for cleanup — the app's database, from the same source the stack uses, independent of the suite-wide DATABASE_URL — and delete the users it created by the ids it collected (E-005: by id, never by prefix or age). Then clean up the 15 it already left: those ARE its own rows, identifiable as cvb-smoke-* users, and you may delete exactly those; say how many you removed.

2. tests/contract/generation-persist.fixtures.ts:9 still defaults DATABASE_URL to ai_cv_builder with \`??=\`. A bare vitest run reaches the app's database through that one file. Point it at the test database like the others.

3. AN ORDERING TIE, not a flake. generation-persist-failure.test.ts failed once with "expected summary first, received contact first". itemsOf() in the fixtures orders only by orderIndex, and contact and summary both carry orderIndex 0 — so the order is whatever Postgres feels like returning, and the test has been passing on luck. Fix the ordering so it is total and deterministic. Decide where it belongs: if the API's read model already guarantees an order for C-006 consumers, the fixture should use that same order rather than inventing one; if it does not, that is the finding and the read model is what needs the deterministic order. Say which you concluded and why — this one is worth getting right, because a CV whose sections come back in a different order on each read is a product defect, not a test defect.

Then run the full gate three times and report each outcome with counts. Do not re-run until green; report what you see.

Note for your report, do not act on it: the previous lane saw 5 failures in one of ten runs, all "runOnce() returned null", in suites that do take the suite lock. Two gate runs were almost certainly executing at once on this machine at the time — a second lane was running its own tests against the same test database. If you see the same symptom, say whether anything else was running.

Files: tests/smoke/*, tests/contract/generation-persist*, api/src/core/cv/read.ts and api/src/core/cv/persist.ts if item 3 lands there.
Read first: framework/docs/decisions.md ADR-019, framework/knowledge/errors.md E-005, framework/docs/api-contracts.md C-006.

Never commit; the Orchestrator commits. Report at most 25 lines.`

const dev = await agent(BRIEF, { label: 'fix:final-three', phase: 'Fix', model: 'sonnet', schema: RESULT })
return { ok: !!(dev && dev.ok), report: dev && dev.report }
