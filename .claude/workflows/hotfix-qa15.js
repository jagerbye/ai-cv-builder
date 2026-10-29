export const meta = {
  name: 'hotfix-qa15',
  description: 'The question column places cards in API order and cannot walk back up, so a card whose field sits higher is stranded',
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

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane: web · allowlist FILE: ${SPRINT}allow/lane-W.txt · lane test: npm -w web run test -- --run src
Stack is up at http://127.0.0.1:5273; seed qa.seed@example.test / qa-seed-password-2026.
Never commit; the Orchestrator commits. Report at most 25 lines.

=== QA-15 (blocker, desktop) — the question column strands a card ===

On desktop the Role question's card lands at y=4795 on a 5034px page while its field is at y=1838 — below the Skill card, past the end of the sheet, with the column beside the marked Role field empty. Mobile places all three correctly. Repro and screenshots: ${SPRINT}qa-report.md QA-15.

The cause, which QA worked out from outside: the cards are rendered in the API's questions[] order — Summary, Skill, Role — while the fields run Summary, Role, Skill. The placement walks down with a push-down cursor, so once it has placed a card at the Skill field's offset it can never place the next one higher, and the Role card is pushed off the end.

This surfaced now because the read model was given a deterministic order last week (items by orderIndex/path/id, questions by priority/createdAt/id). The column had always assumed the API's order matched the document's; that assumption happened to hold before and does not now. It was never true in principle — questions[] is sorted by priority, and priority has nothing to do with where a field sits on the page.

Acceptance:
- Cards are placed in the order of their FIELDS' measured offsets, not the order the API returned them. Sort by measured offset before the push-down pass; the push-down then only ever resolves genuine overlaps between neighbours.
- A question whose field cannot be found still falls after the sheet, as it does today. That fallback is good and stays.
- The test is the task: build a case where the API order and the document order disagree — a high-priority question on a field near the bottom and a low-priority one near the top — and assert each card's placement is beside its own field. With the fix reverted it must fail. Say in your report which assertion goes red.
- Mobile is already correct; do not regress it. Keep whatever it does today and assert it in the same test file.
- Do not change the API. questions[] stays sorted by priority — that is the order the list should be READ in, and it is the UI's job to place them where their fields are.

Read first: ${SPRINT}qa-report.md QA-15 and its recheck2-* screenshots, web/src/features/cv/questions.tsx, framework/docs/api-contracts.md C-006.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: test first, then the fix, then the lane-scoped gate.',
  { label: 'fix:QA-15', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. Run the lane gate and the FULL gate. Revert the fix yourself and confirm the new test goes red, then restore it and say so. Check the mobile path did not regress. Apply the stub-test lens: an assertion that passes whatever the order is proves nothing.',
  { label: 'review:QA-15', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
