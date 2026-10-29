export const meta = { name: 'retry-2', description: 'Floor Retry-After and let the new settings reach the container', phases: [{ title: 'Fix' }] }
const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 20 lines' } }, required: ['ok','blockedOn','report'] }

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation/gateway src/llm src/env
Lane allowlist FILE: ${SPRINT}allow-strict.txt — docker-compose.yml and .env.example are on it now; the allowlist was too narrow, not your code.
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: never read .env, never print a key.

Two findings from the ADR-029 review. Both are small and both are real.

1. **\`Retry-After: 0\` is not floored.** A provider that sends 0 gets up to twelve back-to-back attempts with no pause at all — the 12-attempt ceiling is the only thing standing between us and a hot loop against someone else's server. Give any Retry-After hint a minimum wait (the configured base is the obvious floor) so the header can shorten nothing below what we would have waited anyway. Test \`Retry-After: 0\` and a negative value: both must wait at least the base.

2. **The new settings never reach the container.** \`docker-compose.yml\` does not forward \`ANTHROPIC_RETRY_BASE_SECONDS\` or \`ANTHROPIC_RETRY_BUDGET_SECONDS\`, and \`.env.example\` does not mention them — so setting either in .env does nothing under compose, which makes "configurable the way the others are" false. Forward both the way the existing variables are forwarded, with the empty-string default so an unset variable stays unset, and document them in .env.example beside the others.

Apply the mutation check to the floor and name what went red. Run the FULL gate.

Never commit; the Orchestrator commits. Report at most 20 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF + '\n\nYour step: tests first, then the code, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })
return { ok: !!(dev && dev.ok), report: dev && dev.report }
