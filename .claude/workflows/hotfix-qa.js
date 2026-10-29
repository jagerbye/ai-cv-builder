export const meta = {
  name: 'hotfix-qa',
  description: 'The last QA findings: a seed fixture speaking the old path grammar, two unstyled controls, and CVs left generating by a crash',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
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
  'export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.',
  'The stack is up and rebuilt: web http://127.0.0.1:5273, api http://127.0.0.1:3000. No ANTHROPIC_API_KEY, deliberately.',
  'Lane isolation: bash framework/scripts/check-lane.sh HEAD <your allowlist FILE> (a FILE PATH, not globs). One other lane is in this tree.',
  'GREEN MEANS YOUR LANE: GATE_LANE_TEST=\'<lane test>\' bash framework/scripts/gate.sh.',
  'Every fix needs a test that fails without it. Never commit; the Orchestrator commits. Report at most 25 lines.',
  'The QA report with repro steps and screenshots is ' + SPRINT + 'qa-report.md.',
].join('\n')

const SEED = COMMON + `
Lane S · allowlist FILE: ${SPRINT}allow/lane-S.txt · lane test: npm -w api run test -- --run src/core/jobs src/core/cv tests/contract/generation-persist

Two things, and the first is a lesson about fixtures (E-007 in framework/knowledge/errors.md, read it).

1. scripts/seed-qa.ts writes its three questions by hand with the pre-ADR-016 spellings — \`skills[5]\` and \`summary\` where the contract and the verifier now say \`skills[5].name\` and \`summary.text\`. The re-QA pass read that seeded CV and reported the API as unfixed. The API is fine; the fixture was the last thing in the repo speaking the old grammar, and because QA drives real stored data, the fixture's dialect looked like the product's.

   Do not just edit the strings. The seed already borrows itemsFromDraft from persist.ts for the items; make the QUESTIONS come from the same place — run the draft and facts through \`verify()\` and store what it returns. Then the fixture cannot drift from the verifier again, because it IS the verifier. If a hand-written question is still needed for a case verify() will not produce, assert its path against the C-006 grammar in a test rather than trusting the literal.

   Verify: run the seed, then GET the CV through the API and show the three question paths in your report.

2. QA-14: the QA-10 fix is forward-only. Two CVs from before it are still in state \`generating\` with no live job, and the new list screen renders them as permanent dead rows. That is not only stale data — it is the state a crashed or killed worker leaves behind, and nothing recovers it. The lease and reclaim logic covers the JOB; nothing covers a CV whose job is gone or terminal while the CV still says generating.

   Add the reconciliation: at worker startup, a CV in state \`generating\` with no non-terminal job of its own is marked \`failed\` with a clear code and message (C-000 enum, safe text, same shape as ADR-017's lastError). Scope it by that condition only — never "every generating CV", and never by age or by a name pattern (E-005). Test it: seed a CV generating with a terminal job and one with no job at all, start the worker, assert both reach failed with the right code and that a CV with a live queued job is untouched.

Read first: framework/knowledge/errors.md E-007 and E-005, framework/docs/decisions.md ADR-016 and ADR-017, scripts/seed-qa.ts, api/src/core/jobs/worker.ts, api/src/core/jobs/loop.ts.`

const WEB = COMMON + `
Lane W · allowlist FILE: ${SPRINT}allow/lane-W.txt · lane test: npm -w web run test -- --run src

Three visual findings from the re-QA pass. None is deep; all three are the kind a careful human notices immediately and a test suite never does.

1. QA-08, the half that is still open:
   - The PDF chooser is still a raw \`<input type="file">\`. It got a class but keeps display:block/opacity:1, so the browser renders its own control — which shows the OS locale's label ("Выберите файл") inside an English product. Replace it with a real control: a styled label or button that owns the input, keyboard reachable, showing the chosen file's name, with the native input visually hidden but still focusable and still the thing that holds the file.
   - The Regenerate button on /jobs/:id has className "" and renders as a white browser default. Give it the same treatment the editor's Regenerate has.

2. QA-12: two page containers ship side by side. /auth and /cvs/new hug the left edge while /cvs and the editor are centred. Pick the one the product means — the design is a sheet on a page, so centred — and make every screen use it. One container rule, not four.

3. QA-13: an untitled CV renders an empty \`<h1>\` in the editor while the list correctly says "Untitled CV". Use the same fallback in both places, from one function, so they cannot disagree again.

Assert each one. For QA-13 that is a rendered-value test; for QA-12 a test that every screen's root uses the shared container class; for QA-08 that the file control is reachable by keyboard and that the native input is not what the user sees.

Judge against framework/docs/design/design.json — and note in your report that icons.needed there still lists "trash" while the product now ships zero icons, so the document is stale. Update it if it is in your allowlist; say so if not.

Read first: ${SPRINT}qa-report.md (QA-08, QA-12, QA-13) and its after-* screenshots, framework/docs/design/design.json.`

async function run(label, brief) {
  const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + brief +
    '\n\nYour step: tests first, then the code, then the lane-scoped gate.',
    { label: 'fix:' + label, phase: 'Fix', model: 'sonnet', schema: RESULT })
  const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + brief +
    '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
    '\n\nYour step: verify rather than accept. Run the lane gate and check-lane. For each item say how you confirmed it, and apply the stub-test lens: if an assertion would pass on the unfixed code, say so plainly.',
    { label: 'review:' + label, phase: 'Review', model: 'haiku', schema: RESULT })
  return { label, dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
}

return await parallel([() => run('seed-and-zombies', SEED), () => run('controls', WEB)])
