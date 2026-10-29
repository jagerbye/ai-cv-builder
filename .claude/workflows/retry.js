export const meta = {
  name: 'retry',
  description: 'The retry policy spans a second and a half against a provider hiccup that lasts longer',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 25 lines' } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation/gateway src/llm
Lane allowlist FILE: ${SPRINT}allow-strict.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: a real key sits in .env — never read it, never print one. Your tests drive a fake transport, as they already do.

Read ADR-029 in framework/docs/decisions.md first; it is the decision and the evidence behind it.

THE OBSERVATION, from the live stack an hour ago. A generation failed with \`RATE_LIMITED\` while a hand-made call to the same provider seconds earlier returned 200. The provider's message was *"could not verify available credits for this request in time"* — transient on their side. Request size was ruled out: 1024, 8192 and 32000 max_tokens all behaved the same, with the failure landing at random. \`gateway.ts\` has \`MAX_TRANSIENT_ATTEMPTS = 3\` and \`BACKOFF_BASE_MS = 500\`, so three attempts span about 1.5 seconds and the condition outlives them. F-010 says "exponential backoff up to 3 attempts" and says nothing about the base, so the code satisfied the spec and caught nothing.

Implement ADR-029:
- **Honour \`Retry-After\`** when the response carries one — seconds or an HTTP date, both forms — because the provider knows better than our constant. Cap it at what is left of the job's budget rather than sleeping blindly on whatever a header says.
- **Otherwise exponential backoff with a base in seconds and jitter**, so retries do not land in lockstep.
- **Bound the attempts by the remaining budget**, not by a round number: C-005 gives a job 180 s, so a few seconds of waiting is free, and a provider that is genuinely down must still fail fast enough that a user is not left for three minutes.
- The settings are configurable the way the others are, and the defaults are stated where someone running this will find them.

Tests: drive the clock, never sleep for real. A 429 with \`Retry-After: 2\` waits about two seconds, not the backoff; an HTTP-date form works too; a 429 without the header backs off with jitter inside the expected band; the attempt loop stops when the budget would be exceeded and fails with the right code; a non-retryable failure still fails immediately. Assert the DELAYS, not just the outcome — the defect here was a policy that produced the right outcome shape with useless timing.

Update spec.md F-010's retry sentence with what the policy actually is now.

Apply the mutation check and name what went red. Run the FULL gate.

Never commit; the Orchestrator commits. Report at most 25 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: tests first with a controlled clock, then the code, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. The defect was a policy whose shape was right and whose numbers were useless, so check the NUMBERS: what delay does each path actually produce, and would it have survived the observed failure. Perform the mutations. Confirm no test sleeps for real — a suite that waits seconds is a suite people will disable. Run the full gate.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
