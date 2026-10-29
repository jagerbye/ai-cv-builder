export const meta = {
  name: 'close-sprint',
  description: 'Write the sprint report and the history entry, and run the retro that turns this sprint into memory',
  phases: [{ title: 'Close' }],
}

const SPRINT = 'framework/sprints/SPRINT-001-skeleton-auth/'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    report: { type: 'string', description: 'max 25 lines' },
  },
  required: ['ok', 'report'],
}

const FACTS = `Project root: /Users/mike/Desktop/www/ai-cv-builder. Sprint folder: ${SPRINT}

What happened, for your own reading — verify anything you intend to state:
- One sprint, re-planned into waves: wave 0 (foundation, 3 tasks), wave A (six lanes, 15 tasks), wave B (five lanes, 7 tasks), then QA stage 4.5 and three rounds of fixes.
- Sources of truth: ${SPRINT}plan.md (status board), ${SPRINT}lanes/*.md (lane logs), ${SPRINT}report.md (integration notes), ${SPRINT}qa-report.md (15 findings with screenshots), framework/sprints/board.md (the virtual Jira), framework/docs/decisions.md (ADR-001…019), framework/knowledge/errors.md (E-001…E-008), framework/knowledge/framework-feedback.md (FF-01…FF-15).
- Current state: gate green on 10 of 10 consecutive serial runs; api 587 tests passed / 5 skipped, web 220, smoke 11.
- The git log is the other record: git log --oneline tells the story in commit messages written per task.`

const REPORT = `You are the PM (.claude/agents/pm.md). ${FACTS}

Write the sprint report into ${SPRINT}report.md — it already holds the Integrator's notes, so add the sprint-level sections around them rather than overwriting what is there.

What the report must answer, honestly and with numbers you checked:
- What shipped, as capability rather than task ids: what can a person actually do with this product today, and what can they not.
- What it cost: tasks, waves, review rounds, escalations, and where the time actually went. The lane logs carry \`time:\` lines; the board carries estimates. Where the estimate and the reality disagree, say so.
- What went wrong and what it cost — the defects that were only visible at integration or at QA, each with its mechanism in one sentence. The biggest is not a bug in a feature: 691 tests were green while the browser had no route to the api, because the api suites call the server in-process and the web suites mock fetch. Say what that means for how this project tests.
- What is deliberately not done, and why: no API key so no real generation has run end to end; the five container tests still skipped; B-021…B-023 parked.
- The decisions that shaped the build: ADR-011 (lanes, no worktrees), ADR-013/016 (groundedness and the path grammar), ADR-014 and ADR-019 (the test database story), ADR-015/017/018 (version, lastError, the error codes).

No cheerleading, no "successfully delivered". A reader who was not here should finish it knowing what is solid, what is thin, and what they would hit first if they kept building. Report back at most 25 lines summarising what you wrote.`

const RETRO = `You are the Teamlead (.claude/agents/teamlead.md) running /retro per .claude/skills/retro/SKILL.md. ${FACTS}

Two outputs.

1. Append this sprint's entry to framework/sprints/HISTORY.md, in that file's existing format: what shipped, what broke, what went well, what went badly. Append only — never rewrite earlier entries.

2. Run the retro proper: turn this sprint into organizational memory. The raw material is already written down — errors.md E-001…E-008, the lane logs, the QA report, and framework-feedback.md FF-01…FF-15. Your job is not to restate them; it is to find what they have in common and to write down the thing nobody has written yet.

Look especially for:
- The repeated shape. Four separate incidents (E-002, E-004, E-005, E-008) turned out to be one cause — the suite sharing a database with the app — and each was fixed on its own before anyone saw the pattern. What makes a recurring cause invisible here, and what would have surfaced it on the second occurrence instead of the fourth?
- The tests that passed and should not have. The union gate was green while the product could not be opened; two tests pinned a sibling lane's temporary shape; one test pinned a leak; one asserted nothing (removing the code under it left it green). Those are four different ways a suite can lie. Is there a check that catches that class?
- What the escalation data says. FF-11 changed the runner so only a capability failure escalates; after that, every blocked task returned a decision instead of burning a stronger model. Was the judgement right, and what did it cost or save?
- What should become a rule, and what is just a war story. A rule earns its place by being cheap to follow and expensive to skip.

Write the lasting findings where the playbook says they belong — framework/knowledge/patterns.md for patterns, errors.md for symptoms, and the playbook itself for process fixes. Do NOT touch framework/knowledge/framework-feedback.md: that file is the backlog for porting lessons into the template, and it is handled separately in one pass.

Report back at most 25 lines: what you wrote and where.`

const out = await parallel([
  () => agent(REPORT, { label: 'sprint-report', phase: 'Close', model: 'opus', schema: RESULT }),
  () => agent(RETRO, { label: 'retro', phase: 'Close', model: 'opus', schema: RESULT }),
])
return { report: out[0] && out[0].report, retro: out[1] && out[1].report }
