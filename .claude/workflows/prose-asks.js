export const meta = {
  name: 'prose-asks',
  description: 'Delete the prose deleter: structure keeps the strong guarantee, prose raises questions',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 25 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation src/core/cv tests/contract/generation-persist
Lane allowlist FILE: ${SPRINT}allow/lane-grounding.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: a real key sits in .env — never read it, never print one.

This task REMOVES code. Read ADR-025 in framework/docs/decisions.md first; it is the decision and it explains why, including the three rounds of evidence behind it.

Three adversarial rounds went into detecting invented entities inside free prose with pattern matching. The third reviewer's verdict was that the guarantee does not hold — names with an internal capital, names in uncased scripts, numerals written as words and possessive forms all pass, while "Strong Communication skills" and "Python 3" are deleted. The mechanism cannot close, and the brief never asked for it: *"Anything missing or vague becomes a question to the user."*

So:

1. **Prose is never deleted.** The summary and bullet text are no longer dropped for an unsupported entity, a number, a technology or a duration. Each of those raises a priority-1 question on the field instead, with text that says what is unsupported, and the drafted text stays. Keep the best-effort detection — a flagged phrase is useful — but it may only ever produce a question.

2. **Structured fields keep the strong guarantee, unchanged.** An experience entry whose employer no cited fact names is still dropped; so is an education entry without its institution, a skill, and a contact field. Do not touch that code. If you find yourself editing the entry or contact paths, stop and re-read the ADR.

3. **Delete what is now dead.** The two-tier machinery, the employer-position rule, the suffix-based English exemption, the stoplist entries that exist only to prevent over-fire. If a helper has no caller after the change, it goes. This task should leave the codebase SMALLER; report the line count before and after.

4. **The golden fixture for prompt injection asserts what actually matters**: the injected instruction does not change the output's structure, and the injected claim arrives flagged rather than silently accepted. Update it to that expectation and say so in your report — this is a corrected test with its reason recorded, not a weakened one.

5. **spec.md §3.4 states the guarantee in the two sentences the ADR gives**, and the module header says what the prose check is and is not. No sentence anywhere may imply prose deletion.

6. Every existing test that expected prose to be dropped now expects a question. Keep every assertion about structured fields exactly as it is.

Apply the mutation check to the question-raising paths: delete the push that raises the prose question and show what goes red.

Run the FULL gate.

Never commit; the Orchestrator commits. Report at most 25 lines, and include the before/after line count of api/src/core/generation/verify-entities.ts.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: adjust the tests to the new expectation first, then remove the code, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step, and it is narrower than your last three: do NOT hunt for new prose probes — ADR-025 accepts that prose carries a weak guarantee and says so. Verify instead that (a) no prose path can still delete text, (b) every structured-field drop still happens exactly as before, with the entry, education, skill and contact cases each probed, (c) the codebase actually got smaller, (d) nothing in the spec or the module headers still implies a guarantee prose does not carry. Perform the mutation. Run the full gate.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
