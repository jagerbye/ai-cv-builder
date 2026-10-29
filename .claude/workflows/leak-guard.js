export const meta = {
  name: 'leak-guard',
  description: 'Clean up the session suite, and make a leaked row fail the run instead of the next suite',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 25 lines' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder. export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.

tests/contract/hardening-ratelimit.test.ts was just taught to delete its own users in afterAll, under the suite lock, and that landed. The reviewer then found the same leak next door: tests/contract/hardening-session.test.ts seeds users and never deletes them, and after a full api run one of its queued generation_jobs rows is still sitting in the shared queue.

Fixing that one file is the obvious half of this task. The other half is the one that matters, and it is the same lesson ADR-014 drew about the suite lock: a rule every suite must remember is a rule a suite will forget, and the cost lands on whoever runs next, in a form that looks like a flake (framework/knowledge/errors.md E-004).

Your task, both halves:

1. hardening-session.test.ts cleans up after itself exactly the way hardening-ratelimit.test.ts now does — its own users by id, under the lock if it holds one, cascade doing the rest. Read the ratelimit file first and follow it rather than inventing a second shape. Change no assertion.

2. Make a leak fail the run that caused it. Add a vitest global setup/teardown for the api project that snapshots, before any suite runs, the number of non-terminal generation_jobs rows and the set of user ids; and after every suite has finished, fails the run if either grew — naming the leftover rows' owning emails in the message, so the next person reads "hardening-session leaked 3 queued jobs" instead of a mystery failure three suites later.

   It must be a DELTA, not an absolute count: this database already holds roughly 580 users and 1 700 terminal jobs from earlier runs, and those are not a leak. Do not delete anything that existed before the run — the brief that deleted rows blindly is how the shared database became a minefield in the first place.

   Wire it through api/vitest.config.ts (globalSetup). Check it actually runs and actually fails: prove the failing half by temporarily making a suite leak a row, show the message, and remove that change.

3. Run the full gate twice and report both outcomes with counts.

Files: tests/contract/hardening-session.test.ts, api/vitest.config.ts, and the new global setup file (put it where the other test infrastructure lives — api/src/core/jobs/test-lock.ts and tests/guard/ are the precedents; pick one and say why).
Read first: tests/contract/hardening-ratelimit.test.ts, framework/knowledge/errors.md E-004, framework/docs/testing-strategy.md.

Never commit; the Orchestrator commits. Report at most 25 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF,
  { label: 'fix:leak-guard', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. Confirm the teardown compares a delta and deletes nothing pre-existing. Make a suite leak a row yourself, run the api suite, and report the exact failure message the guard produced — if it does not fail, reject. Then undo your change and run the full gate once. Report at most 25 lines.',
  { label: 'review:leak-guard', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
