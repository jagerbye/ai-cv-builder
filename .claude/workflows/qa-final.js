export const meta = {
  name: 'qa-final',
  description: 'Re-check the five findings that were still open and give the sprint-close verdict',
  phases: [{ title: 'Re-QA' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 35 lines' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `You are the qa-engineer (.claude/agents/qa-engineer.md). Project root: /Users/mike/Desktop/www/ai-cv-builder.

This is the final re-check of ${SPRINT}qa-report.md, which you wrote and updated. Eight of the first eleven findings are already flipped to fixed. Five were still open or new; they have now been worked, and the stack has been rebuilt and reseeded since.

Stack: web http://127.0.0.1:5273 · api http://127.0.0.1:3000 · still no ANTHROPIC_API_KEY, deliberately.
Seed: qa.seed@example.test / qa-seed-password-2026 · CV http://127.0.0.1:5273/cvs/992d6775-5826-4a54-a592-7d08c419db2b
Entering those seeded credentials on this local app is expected and permitted.

Check ONLY these five, at 1440×900 and 375×812, with a screenshot each (save_to_disk into ${SPRINT}qa-screenshots/, named per finding):

- QA-05 (major, the one that blocked close). The paths were right in the API all along; the SEED was the last thing writing the old grammar. It now stores what verify() returns, and the live API returns summary.text, skills[5].name and experience[1].role. So: does each question card now sit beside the field its path names on desktop, and under that field on mobile? Count the cards that found a field against the cards that did not. This is the product's one visual idea — judge it as a user, not as a DOM query.
- QA-08 (visual). The PDF chooser should be a styled control whose label is visible and keyboard-reachable, with the native input hidden from sight but still holding the file; the chosen file's name should appear. The Regenerate button on /jobs/:id should no longer be a white browser default. Try the file control with the keyboard.
- QA-12 (visual). One page container: /auth, /cvs/new, /cvs and the editor should all sit the same way on the page.
- QA-13 (visual). An untitled CV should show the same fallback heading in the editor as the list shows.
- QA-14 (minor). A CV left in \`generating\` by a crashed worker is now reconciled at api startup: the api has been restarted since, so the two ghost rows should be gone from the list — either failed with a message and a retry, or absent. Say which.

Then: a short smoke of the flows you already passed — sign in, the list, open the editor, edit a field, reload — to confirm the rebuild did not break what was working. Not a full pass; you are looking for regressions from the last three changes (the file control, the container rule, the read-model ordering).

One thing to look at specifically, because it changed underneath you: the read model now sorts items deterministically. Confirm the CV's sections and the entries inside them come back in the SAME order on two consecutive reloads.

Update qa-report.md in place: flip each of the five, add any new finding as QA-15 onward. Finish with the verdict: can the sprint close, and if not, exactly what blocks it.

Browser: load the claude-in-chrome tools with ONE ToolSearch call (select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__resize_window,mcp__claude-in-chrome__read_console_messages). Your own tab; close it when done. Say in the report how you reached 375px and whether the viewport control worked this time.

Do not fix anything. Do not commit. Return at most 35 lines.`

const qa = await agent(BRIEF, { label: 'qa-final', phase: 'Re-QA', model: 'opus', schema: RESULT })
return { ok: !!(qa && qa.ok), report: qa && qa.report }
