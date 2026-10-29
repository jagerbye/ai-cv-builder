export const meta = {
  name: 'cvb12',
  description: 'Split the role question, then try to break the groundedness guarantee the owner is being asked to sign',
  phases: [{ title: 'Role' }, { title: 'Confirm' }],
}

const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 30 lines' } },
  required: ['ok', 'blockedOn', 'report'],
}

const ROLE = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
Lane test: npm -w api run test -- --run src/core/generation
Lane allowlist FILE: ${SPRINT}allow-api.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder_test for a bare vitest run.
SECURITY: a real key sits in .env — never read it, never print one.

Both the developer and the reviewer found the same flaw in ADR-026's table and neither forced a number, which was right. The role question covers two different situations and gives both priority 3:

(a) the drafted title appears in NO cited fact — the source does not support it at all;
(b) the title appears in a cited fact that does not also name the employer — the source says it, but does not tie it to this job.

Under ADR-026, (a) is "content is present but the source does not support it" → **2**, and (b) is "content is present and vague" → **3**. The code can tell them apart: it already knows whether any cited fact contains the title text.

Split them, with the question TEXT matching each case — today both say "not in the cited source", which is only true of (a). Test each case separately, assert the priority and the text, and mutate to prove it.

Also update framework/docs/api-contracts.md C-006 if its wording describes only one of the two.

Run the FULL gate with the stack up. Never commit. Report at most 30 lines.`

const CONFIRM = `You are the code-reviewer (.claude/agents/code-reviewer.md). Project root: /Users/mike/Desktop/www/ai-cv-builder. The composed stack is up: api http://127.0.0.1:3000.

THIS IS A CONFIRMATION TASK, AND THE WAY TO CONFIRM A GUARANTEE IS TO TRY TO BREAK IT.

Issue CVB-12 is the product's central guarantee — the deterministic verifier that keeps generated text tied to extracted evidence. It carries the \`critical\` label, which in this project means the owner confirms its final state by hand. It has been held open on purpose: ADR-022, ADR-023, ADR-024, ADR-025 and ADR-026 all rewrote parts of it since it was last signed off, and confirming a guarantee while it is being rewritten would mean nothing. The rewriting has stopped. The owner is about to be asked to sign it.

Your job is to tell them what they would be signing. Read the current claim as the documents state it — framework/docs/spec.md §3.4, ADR-002, ADR-013, ADR-022 to ADR-026 — and then attack it.

Attack, do not review:
1. **The strong half.** The claim is that a structured field — an employer, an institution, a skill, a contact field — is grounded in a cited fact or it is gone. Try to get an unsupported one through: an invented employer, an institution nobody mentioned, an email nobody gave, a skill assembled from two facts. Use the pipeline's own entry points, not hand-made internal calls, and say for each attempt exactly what happened.
2. **The weak half.** Prose is flagged, never deleted. Confirm a flag actually reaches the user: through a real generation on the running stack if you can, otherwise through C-006. A guarantee the UI never surfaces is not a guarantee.
3. **Determinism.** ADR-002 requires the verifier to be a pure function. Run the same draft and facts twice and compare; grep for a clock, randomness or a network call inside verify.
4. **The limits as written.** ADR-024 and ADR-025 list known holes. Check each one still behaves as documented — a limit that has drifted is worse than a limit, because someone has read it and trusted it.

Then write the verdict the owner needs, in plain words and at most fifteen lines: what the guarantee covers, what it does not, what you could not break, and what you could. If you break something, that is the most valuable thing you can produce today — say so first and loudly.

Do not fix anything. Do not commit.`

const role = await agent('You are the developer (.claude/agents/developer.md).\n\n' + ROLE +
  '\n\nYour step: tests first, then the code, then the full gate.',
  { label: 'role-split', phase: 'Role', model: 'sonnet', schema: RESULT })

const confirm = await agent(CONFIRM, { label: 'cvb12', phase: 'Confirm', model: 'fable', schema: RESULT })

return { role: role && role.report, roleOk: !!(role && role.ok), verdict: confirm && confirm.report }
