export const meta = {
  name: 'adr027',
  description: 'Bind questions to items, make "named" mean a word, and let an answer restore what was dropped',
  phases: [{ title: 'Tests' }, { title: 'Code' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 30 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation src/core/cv tests/contract
Lane allowlist FILE: ${SPRINT}allow-api.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run. The stack is up at http://127.0.0.1:3000.
SECURITY: a real key sits in .env — never read it, never print one.

Read ADR-027 in framework/docs/decisions.md first. The owner was about to sign off the groundedness guarantee, so it was attacked instead of reviewed, and three sentences the specification promises turned out to be false. These are the fixes. Each one has a reproduction; use it as the test.

**1. A QUESTION CAN LAND BESIDE THE WRONG FIELD.** verify numbers paths against the DRAFTED arrays. persist stores the ACCEPTED ones with dropped entries removed. read re-sorts by relevance. The editor aligns by position in the response. So one drop shifts every later index onto a different job.
   Reproduction, from the project's own fixture: \`tests/fixtures/golden/prompt-injection.json\` drafts \`[Google, Costa Cafe]\` and accepts \`[Costa Cafe]\`; the question \`experience[0].employer\` — "not in the cited source" — then sits beside Costa Cafe, which is the user's real job.
   Per ADR-027: a stored question binds to the **item id** it is about, and C-006's \`path\` is derived at read time from where that item currently sits. A question about something that was dropped binds to no item and names its SECTION, never an index. That needs a migration and a C-006 clarification of how \`path\` is produced.
   The test that matters: drop an entry, reorder what remains, read through C-006, and assert each question's path points at the item it was actually about. Assert it by the item's CONTENT, not by its index.

**2. "A CITED FACT MUST NAME IT" IS A SUBSTRING TEST.** Through verify(), all of these are accepted today:
   - employer \`Amazon\` against a fact reading "Deployed on Amazon Web Services"
   - institution \`MIT\` against "Submitted 40 patches"
   - skills \`Go\`, \`Java\`, \`C\`, \`SQL\`, \`Rust\` against "Wrote JavaScript at Google; trusted with NoSQL"
   Contact fields already use \`containsToken\`, which respects word boundaries. Employer, institution and skill use the loose \`containsText\`. Move them to the strict one. Every example above becomes a drop with its question; write each as a test.
   Expect existing fixtures to move, and check each one honestly: if a fixture was passing because of the leak, it changes; if it was passing legitimately, it must still pass. Say which were which.

**3. ANSWERING A PRIORITY-1 QUESTION DOES NOT RESTORE ANYTHING.** ADR-026 says priority 1 means "content is missing; only your answer brings it back", and the brief says "the answer updates the relevant part of the CV". \`api/src/core/cv/answer.ts\` around lines 96-124 throws away the re-verify's questions and uses \`accepted\` only to refresh an employer and a role on a \`.period\` answer.
   Make the answer's facts go back through verify, persist the resulting questions, and restore an item the new evidence now supports. The answer is a user-sourced fact and is trusted (F-006) — so an entry whose employer the user has just supplied comes back.
   Test it end to end: an entry dropped for an unsupported employer, the user answers with the employer, the entry is in the CV afterwards and its question is gone.

**4. Two golden fixtures are one word stale.** \`ambiguous-role.json\` and \`reformatted-dates.json\` expect reason \`vague\` for a title no cited fact states; after the role split that case is \`unverifiable\`. They are in your allowlist now. Fix the word and the description text.

Apply the mutation check to every new test and name what went red. Run the FULL gate with the stack up.

Never commit; the Orchestrator commits. Report at most 30 lines.`

const red = await agent('You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + BRIEF +
  '\n\nYour step: the failing tests only, written from the four reproductions above. No production code. The wrong-field one is the hardest and the most important — write it so it fails for the right reason.',
  { label: 'tests', phase: 'Tests', model: 'haiku', schema: RESULT })

let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nThe test-engineer reported:\n' + (red ? red.report : '(no report)') +
  '\n\nYour step: make them green, then run the full gate.',
  { label: 'dev', phase: 'Code', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: attack it, do not read it. Re-run the three original breaks against the running stack and say what happens now. Then try to find a fourth: another way a question can point at the wrong thing, another loose comparison in a structured field, another promise in the spec that the code does not keep. Perform the mutations. Run the full gate.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
