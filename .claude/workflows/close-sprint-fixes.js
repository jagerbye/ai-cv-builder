export const meta = {
  name: 'close-sprint-fixes',
  description: 'Clear the last review items, then give the suite its own database (ADR-019), then re-review the web controls',
  phases: [{ title: 'Lane S' }, { title: 'Test DB' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 25 lines' },
    fixes: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const COMMON = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder.',
  'Lane isolation: bash framework/scripts/check-lane.sh HEAD <your allowlist FILE> (a FILE PATH, not globs).',
  'Never commit; the Orchestrator commits. Report at most 25 lines.',
].join('\n')

const S = COMMON + `
Lane S · allowlist FILE: ${SPRINT}allow/lane-S.txt (api/src/main.ts is on it now — the allowlist was wrong, not your code) · lane test: npm -w api run test -- --run src/core/jobs src/core/cv tests/contract/generation-persist

Your seed fix and your QA-14 reconciliation were both verified working against the live API. Three items from the review, and the first is the guard catching you.

1. tests/contract/generation-persist-reconcile.test.ts:103 writes a queued generation_jobs row directly, and tests/guard/job-writes.guard.test.ts fails the run for it — which is exactly what ADR-014 built that guard to do. Enqueue through openJobTestSuite().enqueue() like everyone else.

2. Two assertions that would pass on unfixed code, both found with the stub lens:
   - The reconcile idempotency test seeds no orphan, so a reconcile that does nothing passes it. Seed a generating orphan, assert the first call returns 1 and the second returns 0.
   - generation-persist-seed-qa.test.ts checks verify(buildSeedData()) and never that the seed STORES what verify returned. A hand-written literal in main() would pass all three tests — which is precisely the defect E-007 is about. Assert the stored question rows.

3. Your reconcile test leaves a queued job in the shared queue. Delete what you create, by the ids you collected (E-005). Note that the next task in this run moves the suite to its own database, which removes the hazard structurally — fix it anyway, because the rule holds between parallel suites too.

Read first: framework/knowledge/errors.md E-005 and E-007, framework/docs/decisions.md ADR-014.`

const T = COMMON + `
Lane T · allowlist FILE: ${SPRINT}allow/lane-T.txt · lane test: the full gate, bash framework/scripts/gate.sh

ADR-019 (framework/docs/decisions.md — read it first) is accepted: the suite gets its own database.

The reason, in one line: this project has now paid four times for one defect. E-002 (two suites' workers stealing each other's jobs), E-004 (a leaked row drained by the next suite, a day lost calling it a flake), E-005 (a cleanup heuristic deleting rows it never created), and now the running container's own worker — since the app actually starts one — claiming a queued row out from under a test, so runOnce() returns null and generation-persist fails about one run in four. Four fixes, one cause: the suite and the app share a database.

Acceptance:
- The gate's database step creates and migrates \`ai_cv_builder_test\` as well, and the suite runs against it. \`docker compose up\` keeps serving \`ai_cv_builder\` for the app and for QA.
- A bare \`npx vitest run\` with no DATABASE_URL set reaches the test database, not the app's — the default in the test setup points there. Someone running vitest by hand is exactly who this protects.
- The smoke suite still runs against the REAL stack and the app's database: its whole subject is the running stack, and pointing it elsewhere would make it prove nothing.
- CI (.github/workflows) does the same thing the gate does, because they must not disagree.
- README and framework/docs/testing-strategy.md say which database is which, in one short paragraph each.
- Prove it: start the stack, run the full gate ten times, and report how many passed. The flake this removes is roughly one in four, so ten runs is the bar. If anything still fails, report the failure rather than re-running until it is green.

Do not weaken, skip or delete a test to make this land. Do not remove the suite lock, the leak guard or the delete-by-id rule: they still hold between parallel suites, and ADR-019 says so explicitly.

Read first: framework/docs/decisions.md ADR-019, framework/scripts/gate.config.sh, api/vitest.config.ts, api/src/core/jobs/test-global-setup.ts, framework/docs/testing-strategy.md.`

const s = await agent('You are the developer (.claude/agents/developer.md).\n\n' + S +
  '\n\nYour step: fix all three, then run the lane-scoped gate and check-lane.',
  { label: 'fix:lane-S', phase: 'Lane S', model: 'sonnet', schema: RESULT })

const t = await agent('You are the developer (.claude/agents/developer.md).\n\n' + T +
  '\n\nYour step: tests and config first, then run the gate ten times as the brief says.',
  { label: 'fix:test-db', phase: 'Test DB', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md). Project root: /Users/mike/Desktop/www/ai-cv-builder.\n\n' +
  'Three pieces of work are waiting on one honest verdict.\n\n' +
  '1. Lane S (seed from verify(), QA-14 reconciliation) reported:\n' + (s ? s.report : '(no report)') + '\n\n' +
  '2. Lane T (ADR-019, the suite\'s own database) reported:\n' + (t ? t.report : '(no report)') + '\n\n' +
  '3. Lane W\'s web controls (QA-08 file chooser and the /jobs/:id Regenerate button, QA-12 one page container, QA-13 the untitled-CV heading) were finished earlier but never got a clean verdict, because the gate was red on another lane\'s guard violation at the time.\n\n' +
  'Your step: run bash framework/scripts/gate.sh yourself, THREE times, and report each outcome with counts — the whole point of ADR-019 was a flake, so a single green run is not evidence. Then:\n' +
  '- For lane S, confirm the reconcile test now seeds an orphan (a do-nothing reconcile must fail it), that the seed test asserts the STORED question rows and not only verify()\'s return, and that the reconcile test enqueues through openJobTestSuite and deletes what it creates.\n' +
  '- For lane T, confirm the suite really is on ai_cv_builder_test (say how you checked), that the smoke suite still points at the real stack, and that no test was weakened to get there.\n' +
  '- For lane W, review the three findings against ' + SPRINT + 'qa-report.md and its screenshots: is the native file input still focusable and still the element holding the file, is there one container rule rather than four, and do the list and the editor get their untitled-CV fallback from one function?\n' +
  'Apply the stub-test lens throughout. List every blocking item in `fixes`. Report at most 30 lines.',
  { label: 'review:close', phase: 'Review', model: 'haiku', schema: RESULT })

return { laneS: s && s.report, laneT: t && t.report, review: review && review.report, ok: !!(review && review.ok) }
