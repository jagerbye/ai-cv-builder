export const meta = {
  name: 'patch-contact',
  description: 'Editing one contact field by hand is rejected because the validator demands a field the contract calls optional',
  phases: [{ title: 'Fix' }],
}

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 20 lines' } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/cv tests/contract/cvs-patch
Lane allowlist FILE: framework/sprints/SPRINT-002-live-model/allow-patch.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: a real key is in .env — never read it, never print one.

FOUND BY RUNNING THE PRODUCT, not by a test. Three probes against the live stack, each one exact:

  PATCH {version, patch:{contact:{location:"Bristol, UK"}}}
    → 400 VALIDATION "patch.contact.fullName must be a string"
  PATCH {version, patch:{summary:{text:"Edited by hand."}}}
    → 200
  PATCH {version, patch:{contact:{fullName,email,phone,location,links}}}
    → 409 VERSION_CONFLICT (the version had moved; the concurrency path is fine)

So partial patching works at the top level and fails inside \`contact\`: the validator requires \`fullName\` to be present. Both contracts say it should not. C-006 lists contact as \`{ fullName?, email?, phone?, location?, links: string[] }\` — every field optional but \`links\`. C-008 says "any field present is replaced, absent fields are untouched". And the brief this product answers says plainly: *the user can edit any field by hand*. Editing only a location through the API is impossible today.

Fix:
- A \`contact\` patch accepts any subset. A field present is validated for its type and replaced; a field absent is left exactly as it was, including its \`userEdited\` state and its citations. \`links\` behaves like the arrays C-008 already describes: sent whole when it is sent at all.
- A present field of the wrong type is still a 400, with the same message shape as today. Do not loosen the type checks — loosen only the requiredness.
- Every field touched this way comes back \`userEdited: true\`, as C-008 requires, and the untouched ones keep whatever they had.

Tests, and they are the acceptance:
- Each contact field patched alone, asserting the patched value, \`userEdited\` on it, and that every OTHER contact field is byte-identical to before — that last assertion is the one that matters.
- A wrong type in a present field is still 400.
- A contact patch does not disturb summary, experience, education or skills.
- Check whether the same requiredness bug exists in the other patchable sections — education and skills entries have optional fields too. If it does, fix it the same way and say so; if it does not, say that you checked.

Apply the mutation check and name what went red. Run the FULL gate.

Never commit; the Orchestrator commits. Report at most 20 lines.`

const dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + BRIEF +
  '\n\nYour step: tests first, then the code, then the full gate.',
  { label: 'fix', phase: 'Fix', model: 'sonnet', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify by probing the running stack the way the finding was made — a partial patch of each contact field in turn against http://127.0.0.1:3000/api, with a fresh user. Report the status codes you actually saw. Then perform the mutation and run the full gate.',
  { label: 'review', phase: 'Fix', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
