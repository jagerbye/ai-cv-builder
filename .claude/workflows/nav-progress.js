export const meta = {
  name: 'nav-progress',
  description: 'There is no way to navigate the signed-in app, and the generation view says what stage it is at without showing where that sits in the whole',
  phases: [{ title: 'Build' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 25 lines' } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w web run test -- --run src
Lane allowlist FILE: ${SPRINT}allow-nav.txt — web only. Do NOT touch framework/docs; another lane holds it and the Orchestrator will write the spec lines.
The composed stack is up: web http://127.0.0.1:5273.
SECURITY: a real key sits in .env — never read it, never print one.
Every change needs a test that fails without it, and the mutation check from .claude/rules/testing.md: name the line you deleted and what went red.
Never commit; the Orchestrator commits. Report at most 25 lines.

Two things a user is missing. The owner asked for both.

1. **THERE IS NO NAVIGATION.** web/src/app/App.tsx renders a header with the product name and a logout button, and nothing else. From the editor there is no way back to the CV list; from the list there is no way to start a new CV except the one link in its empty state; from the progress view there is nowhere to go at all. The only general exit is the browser's back button.

   Add navigation to the signed-in shell: the CV list and starting a new CV. Requirements, not suggestions:
   - It appears only when there IS a session. A signed-out visitor sees the brand and nothing to click — web/src/features/auth/session.tsx already knows the session state; use it rather than guessing from the path.
   - The current location is marked, and marked for a screen reader too, not only in colour.
   - It works at 375px without a horizontal scrollbar and without covering the logout button. The header already had an overlap defect once (QA-07); do not reintroduce it — assert the layout.
   - Keyboard reachable in a sensible order, with a visible focus ring.
   - design.json governs. The product ships ZERO icons and the rule caps the set; amber belongs to questions and red to errors, so neither is available for a nav state.

2. **THE PROGRESS VIEW SHOWS THE STAGE BUT NOT THE SHAPE.** web/src/features/generation/route.tsx prints the current stage as a sentence — "Queued. It will start shortly.", then the stage copy. A user cannot tell whether that stage is the first of four or the last.

   Give it a stepper over the KNOWN sequence: queued → extracting → composing → verifying, with the stages behind the current one marked done, the current one marked current, and the ones ahead plain.

   **Do not add a percentage, and this is not a style preference.** The file's own comment says "Named stages only, never a percentage (spec §3.3)". The server does not know how long a stage takes, so a percentage would be invented — in a product whose entire point is not inventing what it does not know. A stepper shows position in a known sequence, which is a fact. Say that in a comment where the next person will read it.

   - It must be honest about \`queued\`: nothing has started yet.
   - A failed job shows where it failed, not a half-finished bar.
   - Use the progressbar role only if you can give it real values; otherwise a list with the current step marked is more truthful and screen readers handle it better. Choose, and say which and why.
   - The existing behaviour stays: the server is the only source of progress, every mount refetches, and a reload must not lose the work in progress (spec F-003).

Tests assert rendered values — which step is marked current for a given stage, that a signed-out header has no nav, that the current page is marked, that nothing overflows at 375px — not that an element exists.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: tests first, then the code, then the lane-scoped gate.',
  { label: 'build', phase: 'Build', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. Perform the mutations. Then answer as a user, not as a reader of the diff: from the editor, how many clicks to a new CV; at 375px does the header still fit with the nav, the brand and logout; with the job at `composing`, what exactly does the stepper show. Run the full gate.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
