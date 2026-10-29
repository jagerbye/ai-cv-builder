export const meta = {
  name: 'base-url',
  description: 'The gateway hard-codes the Anthropic endpoint, so the one thing this build has never done cannot be done at all',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string' } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/llm src/core/generation/gateway src/env src/core/generation/sdk-seam
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run (ADR-019).

SECURITY, before anything else: there is now a real API key in this project's .env. Never print it, never echo it, never copy it into a test, a fixture, a log line, a report or a comment. Do not cat .env. Everything you need from it you can learn from variable NAMES. .env is gitignored and must stay that way.

WHY THIS TASK EXISTS: this build has never made a single real model call, which the README names as its one unproven claim. The owner has supplied a key for an Anthropic-compatible endpoint, and the gateway cannot use it: it constructs the SDK client with an api key and nothing else, so the endpoint is whatever the SDK defaults to. One missing option is standing between this project and the evidence it is missing.

I have already probed the endpoint by hand, so you are not guessing:
- POST https://openrouter.ai/api/v1/messages with header x-api-key — 200, a normal Anthropic Messages response.
- The same with tool_choice forcing a named tool and a strict input_schema — 200, stop_reason "tool_use", a well-formed tool_use block. So the gateway's whole design (ADR-006) works through it unmodified.

Acceptance:
- \`ANTHROPIC_BASE_URL\` is read in api/src/env.ts beside the key: OPTIONAL, and when present it must parse as an http(s) URL or boot fails loudly with the variable name and no value (the existing DATABASE_URL validation is the pattern to copy — it never echoes a value, because these strings carry credentials).
- The gateway passes it to the SDK client as \`baseURL\` when set, and omits the option entirely when not, so the default endpoint is untouched. Nothing else about the client changes.
- \`ANTHROPIC_MODEL\`: api/src/llm/config.ts already reads one. Check it is actually plumbed through env.ts rather than reaching into process.env behind the Env type, and fix it the same way if it is not.
- docker-compose.yml passes ANTHROPIC_BASE_URL and ANTHROPIC_MODEL to the api service the way it already passes the key — empty-string default, so an unset variable stays unset rather than becoming the string "".
- .env.example gains both, commented, with the explanation that the base URL exists for an Anthropic-compatible proxy and that leaving it empty means the Anthropic API itself.
- Tests: the client is built with baseURL when the variable is set and WITHOUT the option when it is not; a malformed base URL fails validation; no test contains a real key. api/src/core/generation/sdk-seam.test.ts is where the client construction is already observed — look there first.
- Docs: framework/docs/architecture.md where the gateway is described, and README's Running it / Status if either states where calls go.

Apply the mutation check from .claude/rules/testing.md to the new test and report the line you deleted and what went red.

Never commit; the Orchestrator commits. Report at most 20 lines, and no secret values in it.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: test first, then the code, then the lane-scoped gate.',
  { label: 'fix:base-url', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept. Perform the mutation yourself. Check specifically that the option is OMITTED, not passed as undefined or an empty string, when the variable is unset — a client built with baseURL:"" would silently break every default deployment, which is the failure this task could most easily introduce. grep the diff and the whole tests tree for anything that looks like a key, and confirm .env is still ignored. Run the full gate once.',
  { label: 'review:base-url', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
