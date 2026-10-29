export const meta = {
  name: 'separators',
  description: 'Close the enumerated separator list: C++ and C# must not ground the skill C',
  phases: [{ title: 'Fix' }],
}

const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 20 lines' } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation
Lane allowlist FILE: ${SPRINT}allow-strict.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: never read .env, never print a key.

The reviewer enumerated every separator a name can contain and probed each one against the real \`verify-entities.ts\`. The list is CLOSED, and this task applies the fix it named. There is no round after this one; what is not on the list below stays as the written limit in ADR-028.

Correctly rejected already, do not change: \`-\` \`/\` \`_\` \`.\`, en dash, em dash, U+2010, U+2011, U+2012, U+2015, non-breaking space.

Still leaking, fix these:
- \`&\` — "Acme&Co" grounds the employer \`Acme\`
- \`+\` and \`#\` — **"C++" and "C#" ground the skill \`C\`**, which is the one that matters: both appear in real CVs, and a person who writes C++ has not thereby claimed C
- U+2212 MINUS SIGN — "Acme−Labs" grounds \`Acme\`; it is simply missing from the dash range the code already keeps
- the doubled forms \`--\` and \`/-\` end the name early (rare typo, include it since you are in the expression)

Deliberately NOT fixed, and it must stay working: \`'\` — "Acme's" is a legitimate possessive of a cited name and grounding it is correct. "D'Angelo" grounding \`D\` is the cost, and it is a smaller cost than breaking every possessive. Add that sentence to ADR-028's limit paragraph so the next reader does not "fix" it.

One character class in \`CONTINUES\`, U+2212 added where the other dashes are kept, and a named test per symbol — including the positive controls that must keep working: "Acme's platform" still grounds \`Acme\`, "Wrote Go, Rust" still grounds \`Go\`, "Acme - Labs" still grounds \`Acme\`.

Apply the mutation check and name what went red. Update ADR-028's limit paragraph to the list as it stands after your change. Run the FULL gate.

Never commit; the Orchestrator commits. Report at most 20 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: a test per symbol first, then the one expression, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

return { ok: !!(dev && dev.ok), report: dev && dev.report }
