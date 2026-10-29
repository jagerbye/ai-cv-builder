export const meta = {
  name: 'qa-recheck',
  description: 'Re-check the eleven QA findings in a real browser and flip each one in the report',
  phases: [{ title: 'Re-QA' }],
}

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 40 lines' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `You are the qa-engineer (.claude/agents/qa-engineer.md), running the re-check stage of framework/process/qa-playbook.md. Project root: /Users/mike/Desktop/www/ai-cv-builder.

You wrote framework/sprints/SPRINT-001-skeleton-auth/qa-report.md after the first pass: four blockers (QA-01…QA-04), two majors (QA-05, QA-06) and five lesser findings (QA-07…QA-11). All eleven have been worked. Your job is to re-check them in a real browser and flip each status — not to run the whole pass again.

The stack is rebuilt and up:
- web http://127.0.0.1:5273 · api http://127.0.0.1:3000 · db 127.0.0.1:5432
- There is still NO ANTHROPIC_API_KEY, deliberately. A generation will fail, and HOW it fails is now part of what you check.
- \`curl -i http://127.0.0.1:5273/api/health\` returns JSON through the web origin. QA-01's throwaway proxy is not needed; use the real app on 5273 this time, and say plainly if anything still forces you off it.
- The seeded account from the first pass still exists; scripts/seed-qa.ts recreates it (npx vite-node scripts/seed-qa.ts) and prints the sign-in and the CV id. Entering those seeded credentials on this local app is expected and permitted.

What changed, so you know where to look — verify each, do not take it:
- QA-01: vite now proxies /api to the api from both dev and preview; a smoke suite asserts it.
- QA-02: "/" routes — signed out to sign-in, signed in to the list.
- QA-03: the CV list actually fetches GET /api/cvs and links each row to its editor; a failed load says so instead of claiming the list is empty.
- QA-04: a 503 on answering re-syncs the version, so the next save no longer gets a false 409.
- QA-05: question paths name the field (summary.text, skills[i].name, experience[i].period), so the cards should now sit beside their fields.
- QA-06: textareas grow with content.
- QA-07: the signed-in header no longer overlaps.
- QA-08: native controls styled. QA-11: no icons at all now — "Delete" everywhere.
- QA-09: a deep link survives sign-in; /auth redirects an already-signed-in visitor.
- QA-10: a failed job takes the CV to state failed, and the CV now carries its error: a missing key shows as a configuration failure with a Regenerate retry, not as "something went wrong on our side".

Re-check every one at BOTH 1440×900 and 375×812, screenshot each (save_to_disk) into framework/sprints/SPRINT-001-skeleton-auth/qa-screenshots/ with a name that says which finding it answers, and put the real paths in the report.

Browser: load the claude-in-chrome tools with ONE ToolSearch call (select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__resize_window,mcp__claude-in-chrome__read_console_messages). Create your own tab; close it when done. Note in the report any viewport you could only reach through an iframe, as you did last time.

Then update qa-report.md in place: flip each finding's Status to \`fixed\` with the date and the after-screenshot path, or leave it open with what you still see. Add any NEW finding you hit as QA-12 onward — a fix wave is exactly where new defects appear, and the header overlap fix and the new list screen are the likeliest places.

Finish with a verdict: can the sprint close, or what still blocks it. Do not fix anything. Do not commit. Return at most 40 lines.`

const qa = await agent(BRIEF, { label: 're-qa', phase: 'Re-QA', model: 'opus', schema: RESULT })
return { ok: !!(qa && qa.ok), report: qa && qa.report }
