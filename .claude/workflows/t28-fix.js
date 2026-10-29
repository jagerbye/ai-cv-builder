// t28-fix.js — two blocking items on the persist path, one of them a frozen
// contract the review listed as a note.

export const meta = {
  name: 't28-fix',
  description: 'Persist the extracted facts (C-006) and stop stale run-A text surviving a shorter run B',
  phases: [{ title: 'Fix' }, { title: 'Review' }],
}

const BASE = 'c2530e6'
const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'
const LANE_TEST = "npm -w api run test -- --run src/core/jobs src/core/cv tests/contract/generation-persist tests/contract/cvs-regenerate"

const HEAD = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder. Sprint: ' + SPRINT,
  'You are lane 12. Lane file: ' + SPRINT + 'lanes/lane-12.md',
  'Lane test command: ' + LANE_TEST,
  'Lane allowlist FILE: ' + SPRINT + 'allow/lane-12.txt — bash framework/scripts/check-lane.sh ' + BASE + ' ' + SPRINT + 'allow/lane-12.txt (the second argument is a FILE PATH, not globs).',
  'Other lanes have approved but uncommitted work in this tree (api/src/http/**, api/src/routes/**, web/**, tests/guard/**, tests/contract/cvs-answer*, tests/contract/cvs-regenerate*). Those are not your violations.',
  'GREEN MEANS YOUR LANE: GATE_LANE_TEST=\'' + LANE_TEST + '\' bash framework/scripts/gate.sh. Never run the root test command.',
  'export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_cv_builder before running vitest by hand.',
  'A test committing a non-terminal generation_jobs row goes through openJobTestSuite().enqueue() (ADR-014); tests/guard enforces it.',
  'Never commit; the Orchestrator commits. Report at most 30 lines.',
  '',
  '=== T-28, fix round: two blocking items ===',
  '',
  `1. STALE PARENT (the reviewer's blocking item). api/src/core/cv/persist.ts:154-156. When a top-level entry is kept only because one of its bullets is userEdited, and run B's draft has no generated entry at that path, \`fresh\` is undefined and the loop continues — so the entry keeps run A's employer, role, period, location, factIds, relevance and orderIndex. Run A text then survives a run that did not produce it, which is exactly the invariant this task exists to hold. Fix it, and add the test the reviewer asked for: run B omits experience[0], and the C-006 response contains no run-A employer text anywhere. Decide and state in the report what happens to the entry itself — the edited bullet is the user's and must survive, so the entry that carries it has to survive too; what must not survive is any generated field on it that run B did not produce.`,
  '',
  `2. PERSIST THE FACTS. The review listed this as "open item 1, for the Architect". It is not optional and it is not an open question: C-006 is frozen and its response includes \`facts: [ { id, kind, text, sourceQuote, source: "document"|"user" } ]\`, with the contract's own note that facts are what let the UI show where a line came from (F-004). Every item also carries \`factIds\`, and those ids point at rows that do not exist while nothing writes the facts table. So today C-006 serves an empty facts array and dangling factIds on every generated item.`,
  '',
  `   Write the extracted facts in the same transaction as the draft, with source 'document'. On a regeneration, the run's document facts REPLACE the previous run's document facts, and facts with source 'user' are kept untouched — those are the user's answers (C-009), they are trusted input, and a regeneration must not delete them. Assert both halves: a generated item's factIds all resolve to stored facts, and a user fact written before a regeneration is still there after it.`,
  '',
  `   If the draft's factIds reference facts the extract stage produced but the stored set does not contain, that is a bug to surface, not to paper over — report it rather than filtering the ids.`,
  '',
  'Do not change the fence or the transaction boundary; the lease test passes and that behaviour is approved. Do not touch tests/contract/cvs-answer*, tests/contract/cvs-regenerate* or api/src/routes/** — lane 07 owns them and is green.',
  'framework/docs/api-contracts.md C-006 and framework/docs/database-schema.md §facts are the references.',
].join('\n')

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 30 lines' },
    fixes: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'blockedOn', 'report'],
}

let dev = await agent('You are the developer (.claude/agents/developer.md).\n\n' + HEAD +
  '\n\nYour step: tests first for both items, then the code, then the lane-scoped gate.',
  { label: 'fix:T-28', phase: 'Fix', model: 'sonnet', schema: RESULT })

let review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + HEAD +
  '\n\nThe developer reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify both items against the code, run the lane-scoped gate and check-lane yourself, and apply the stub-test lens — a facts test that only counts rows is decoration; it must prove the ids resolve and that a user fact survives a regeneration. Put every blocking item in `fixes`.',
  { label: 'review:T-28', phase: 'Review', model: 'haiku', schema: RESULT })

if (review && !review.ok) {
  const list = (review.fixes && review.fixes.length ? review.fixes.join('\n- ') : review.report)
  const second = await agent('You are the developer (.claude/agents/developer.md).\n\n' + HEAD +
    '\n\nThe reviewer rejected the fix round with:\n- ' + list +
    '\n\nClear every item, then re-run the lane-scoped gate. If an item is wrong, say which and why.',
    { label: 'fix2:T-28', phase: 'Fix', model: 'sonnet', schema: RESULT })
  review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + HEAD +
    '\n\nThis is a re-review. The second fix pass reported:\n' + (second ? second.report : '(no report)') +
    '\nCheck only the fix-list items and whether anything regressed.',
    { label: 're-review:T-28', phase: 'Review', model: 'haiku', schema: RESULT })
  dev = second || dev
}

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev ? dev.report : null, reviewReport: review ? review.report : null }
