export const meta = { name: 'docs-sync', description: 'Eight ADRs and four features landed today; check what the specification and the architecture actually say', phases: [{ title: 'Audit' }] }
const SPRINT = 'framework/sprints/SPRINT-002-live-model/'
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, report: { type: 'string', description: 'max 30 lines' } }, required: ['ok','report'] }

const BRIEF = `Project root: /Users/mike/Desktop/www/ai-cv-builder.
You may edit: framework/docs/spec.md, framework/docs/architecture.md, framework/docs/api-contracts.md, framework/docs/database-schema.md, framework/sprints/backlog.md.
Do NOT touch: framework/docs/decisions.md, framework/knowledge/**, framework/sprints/board.md, HISTORY.md, STATE.md, README.md, SUMMARY.md, or any code.
Lane test: npm -w api run test -- --run src/core/generation src/core/cv  (the docs have tests that read them)

THE DOCS-SYNC RULE says docs are updated in the same change as the code. A lot landed today across many lanes, and the rule has probably been kept unevenly. Your job is to AUDIT first and fix second: for each item below, say what the docs currently claim, then correct what is wrong or missing. Do not rewrite what is already right.

Changes to verify, each with where it most likely belongs:
1. **ADR-027 question binding** — a stored question binds to the item id; C-006's \`path\` is derived at read time from where that item sits; a question about a dropped item names its section. (api-contracts C-006, database-schema questions table, spec §3.5)
2. **ADR-027 whole-word grounding** — employer, institution, skill and role are established by a WHOLE WORD in a cited fact, not a substring. (spec §3.4)
3. **ADR-027 answers restore** — answering a priority-1 question restores an item the new evidence supports. (spec §3.5, api-contracts C-009)
4. **ADR-028 separators** — what continues a name and what ends it, and the stated limits including the deliberate apostrophe. (spec §3.4 limits)
5. **ADR-029 retries** — Retry-After honoured and floored, seconds-scale backoff with jitter, bounded by a waiting budget; two settings. (spec F-010, architecture's gateway section)
6. **ADR-026 question priority** — what 1, 2 and 3 mean. (api-contracts C-006)
7. **ADR-021 lastError and the token ledger** — a failed CV carries code and message; the budget is per job. (api-contracts C-006, architecture)
8. **The contact block** — compose produces it, persist stores it with per-field citations, C-006 serves it. (spec §3.4, api-contracts C-006, database-schema)
9. **Three features with no entry anywhere yet, most likely:** navigation in the signed-in shell; the generation progress STEPPER (named stages, deliberately no percentage — say why); and the FACTS SCREEN, where every generated line can reveal the verbatim quotes behind it with its source labelled. All three are user-visible, so spec.md owes them acceptance criteria, and backlog.md owes them their item state.

For each of the nine: report "already correct", or name what you changed. A doc that describes last week's behaviour is worse than one that says nothing, so prefer deleting a stale sentence over leaving it.

Then run the lane test (some tests read these documents) and the full gate.

Never commit; the Orchestrator commits. Report at most 30 lines.`

const dev = await agent('You are the Architect (.claude/agents/architect.md).\n\n' + BRIEF, { label: 'audit', phase: 'Audit', model: 'fable', schema: RESULT })
return { ok: !!(dev && dev.ok), report: dev && dev.report }
