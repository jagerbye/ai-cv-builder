export const meta = {
  name: 'strict-match',
  description: 'Hyphens and slashes leak through the word boundary, the role never got the strict test, and a unit test reads the developer machine .env',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 30 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation src/llm src/env
Lane allowlist FILE: ${SPRINT}allow-strict.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run. The stack is up.
SECURITY: a real key sits in .env — never read that file, never print a key. You do not need its contents; you need its EXISTENCE to be irrelevant, which is item 3.

ADR-027 landed and the reviewer attacked it again. Three findings, all bounded, and this is the last round on this component — after it the residue is written down as a limit and the file is closed.

**1. HYPHENS AND SLASHES LEAK THROUGH THE WORD BOUNDARY.** Verified through verify(), all accepted today:
   - employer \`Acme\` against "Worked at Acme-Labs" and "Acme/Labs" (note \`Acme_Labs\` is correctly dropped, so only \`-\` and \`/\` leak)
   - institution \`MIT\` against "MIT-IBM Watson AI Lab"
   - skill \`C\` against "C-level strategy"; skill \`Go\` against "Go-Live"
   - contact fullName \`Jane Doe\` against "Jane Doe-Smith"; location \`Paris\` against "Paris-Saclay"
   The lookaheads in containsWord, containsEmployer and containsToken must reject a hyphen, slash or underscore followed by a letter or digit, the same way they already reject a letter. One rule in one place if the three can share it.

**2. THE ROLE NEVER GOT THE STRICT TEST.** It still uses \`containsText\`, so \`Engineer\` is grounded by "Engineering Manager" and \`Lead Engineer\` by "Lead Engineering Analyst". A different job title passing as supported is the clearest break of the lot. Move it to a strict phrase match.

**3. A UNIT TEST READS THE DEVELOPER'S .env.** \`gateway.test.ts\` has a case named "leaves the SDK default endpoint untouched when no base URL is set", and it fails because this machine's .env sets a base URL and the config loader picks it up. The test's premise is false on any machine that has a .env — which is every machine where someone has run the product.
   This is an isolation defect of the same family as ADR-019, where the suite got its own database: a test asserting "when the variable is unset" must UNSET it, not hope the machine agrees. Fix the test, and look for siblings — any other test whose premise is an absent environment variable. Add the rule to framework/docs/testing-strategy.md in one line.

**4. CONFIRM AND DOCUMENT, do not change:** the new employer rule drops \`Acme\` when the fact says "Acme Warsaw", because it refuses an employer that is only the first word of a longer capitalised name. That is the same rule that correctly drops \`Amazon\` against "Amazon Web Services", and no deterministic test can tell a branch office from a different company. The strict direction is right — the entry drops and the user is asked — and the limit goes in writing where ADR-024's and ADR-025's limits already are.

Every example in items 1 and 2 becomes a test. Apply the mutation check to each and name what went red. Check the golden fixtures for the same leak and say what you found. Run the FULL gate: it must be green, including the gateway case from item 3.

Never commit; the Orchestrator commits. Report at most 30 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: tests first — every example above, as a named case — then the code, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: attack the boundary one last time. Enumerate the separators a name can contain — hyphen, slash, underscore, dot, apostrophe, ampersand, non-breaking space, the unicode dashes — and for each say whether it leaks or over-fires, with the probe you ran. That list is the closing evidence: whatever still leaks becomes a written limit rather than another round. Perform the mutations. Run the full gate.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
