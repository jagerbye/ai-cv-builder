export const meta = {
  name: 'finish-five',
  description: 'Container tests that never run, a priority that contradicts its own rule, and the facts screen the data has been waiting for',
  phases: [{ title: 'Build' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-002-live-model/'

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 25 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const COMMON = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder.',
  'export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run (ADR-019); the app keeps ai_cv_builder.',
  'The composed stack is running: web http://127.0.0.1:5273, api http://127.0.0.1:3000.',
  'SECURITY: a real key sits in .env — never read it, never print one.',
  'Every fix needs a test that fails without it, and the mutation check from .claude/rules/testing.md: name the line you deleted and what went red.',
  'Never commit; the Orchestrator commits. Report at most 25 lines.',
].join('\n')

const API = COMMON + `
Lane: api · allowlist FILE: ${SPRINT}allow-api.txt · lane test: npm -w api run test -- --run src/core/generation tests/contract/auth-session-container

Two things.

1. **FIVE TESTS THAT NEVER RUN.** tests/contract/auth-session-container.test.ts is a black-box session flow against the running api IMAGE — register, me, logout, me, login — and it is gated on CONTAINER_API_URL being set. Nobody sets it, so the five have been reported as "skipped" in every gate run this project has ever made. A test that never runs is not coverage; it is a comment that costs a line in the summary.
   Make them run as part of the full gate when the stack is up, the way the smoke suite already does: the gate's smoke step knows how to find the web origin and skips with a clear message when nothing answers. Follow that pattern rather than inventing a second one — read framework/scripts/gate.config.sh and tests/smoke/ first. Under SMOKE_REQUIRED (which CI sets) an absent stack must FAIL rather than skip, for the same reason.
   Verify by running the gate with the stack up and showing the five pass, and with the stack unreachable showing they skip.

2. **A PRIORITY THAT CONTRADICTS ITS OWN RULE.** Question priority is meant to follow the REASON — 1 for something missing, 2 for something unverifiable, 3 for something vague — so that the editor can order what the user should answer first. It mostly does, except an uncited bullet is raised at priority 1 while an uncited summary is raised at priority 2 (verify.ts around line 149), so the same condition gets two different urgencies depending on which field it happened to land in.
   Make priority a function of the reason, in one place, so the two cannot drift again. Keep every existing reason assignment exactly as it is — you are changing WHERE the number comes from, not which reason any case gets. Assert that an uncited bullet and an uncited summary come back with the same priority.
   framework/docs/api-contracts.md C-006 should say what the three priorities mean, since a consumer orders by them.`

const WEB = COMMON + `
Lane: web · allowlist FILE: ${SPRINT}allow-web.txt · lane test: npm -w web run test -- --run src

**THE FACTS SCREEN (backlog B-022).** C-006 already serves every fact with its verbatim \`sourceQuote\` and every generated item carries the \`factIds\` it was built from. The contract says so in as many words: *"facts is what lets the UI show 'where did this line come from' (F-004)"*. Nothing in the UI shows it. This is the cheapest remaining feature in the product and the only one that demonstrates the anti-hallucination design to a USER rather than to a reviewer reading ADRs.

Build it:
- Every generated field that carries factIds can reveal its sources: the verbatim quote of each cited fact, and whether the fact came from the document or from the user's own answer (\`source: "document" | "user"\`).
- A field with no citations says so plainly. A user-edited field says it is the user's own, not the document's — \`userEdited\` already distinguishes them.
- It must work on a phone. The question column already solves the "attach something to a field" problem at 375px by collapsing under the field; do not invent a second mechanism — read web/src/features/cv/questions.tsx and follow it.
- Keyboard reachable, and it closes the way a reader expects.
- design.json governs: the product currently ships ZERO icons and the rule caps the set — if you want one here, that is a decision to raise, not to take. Amber belongs to questions and must not be borrowed.

Tests assert rendered values from a mocked C-006 response: the quote of a cited fact appears, a user-sourced fact is distinguishable from a document one, a field with no citations says so, and the whole thing is reachable by keyboard. Not "a panel exists" — the actual quote text.

This is a feature, so it also needs its lines in framework/docs/spec.md §3.4 or wherever the facts are described as user-visible, and the backlog item marked.`

async function run(label, brief, model) {
  const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + brief +
    '\n\nYour step: tests first, then the code, then the lane-scoped gate.',
    { label: 'build:' + label, phase: 'Build', model, schema: RESULT })
  const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + brief +
    '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
    '\n\nYour step: verify rather than accept. Perform the mutation. Run the full gate. For the web lane, say what a user actually sees and whether a quote is readable at 375px; for the api lane, show the five container tests passing with the stack up and skipping without it.',
    { label: 'review:' + label, phase: 'Review', model: 'haiku', schema: RESULT })
  return { label, dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
}

return await parallel([() => run('api', API, 'sonnet'), () => run('web', WEB, 'sonnet')])
