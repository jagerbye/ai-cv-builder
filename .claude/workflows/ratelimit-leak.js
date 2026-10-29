export const meta = {
  name: 'ratelimit-leak',
  description: 'Stop the rate-limit contract suite leaving fifty queued jobs behind for other suites to drain',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 20 lines' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder. export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.

tests/contract/hardening-ratelimit.test.ts proves the 10-generations-an-hour limit by creating about fifty CVs through POST /api/cvs. Each one commits a queued generation_jobs row, and the suite deletes none of them. It then releases the job-suite lock and the rows stay queued in a database every other suite shares.

That leak cost a day of calling a reproducible failure a flake: the persist suite's worker drains the oldest queued rows first, ran fifty foreign jobs through its own pipeline, and collided on a fixed fact id. The persist suite now clears the queue before enqueueing, so it is immune — the leak itself is still there, and the next suite that assumes an empty queue will pay the same price (framework/knowledge/errors.md E-004).

Your task: hardening-ratelimit.test.ts cleans up after itself. Delete the rows it created — its jobs, its CVs and its users — while it still holds the suite lock, so the deletion cannot race another suite's worker. afterAll is the natural place; check whether the suite already has one.

Constraints:
- Do not weaken a single assertion. The suite's subject is the limit, and every assertion about 429, Retry-After and the window boundaries stays exactly as it is.
- Do not delete rows you did not create. Scope the cleanup to this suite's own users and their cascade, not to "every queued job" — api/src/core/jobs/test-lock.ts has clearOpenJobs() for the blunt version and it is not what this needs.
- Verify: run the api suite twice in full and report both results, then run bash framework/scripts/gate.sh once and report the outcome and the counts.

Files: tests/contract/hardening-ratelimit.test.ts only. Never commit; the Orchestrator commits. Report at most 20 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF,
  { label: 'fix:leak', phase: 'Fix', model: 'haiku', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify, do not take the claim. Read the cleanup and say exactly which rows it deletes and whether it can delete another suite\'s. Confirm the lock is still held when it runs. Run the full gate yourself once and report the outcome. Then check the leak is actually gone: after the api suite finishes, no queued or running generation_jobs row should remain — say how you checked.',
  { label: 'review:leak', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
