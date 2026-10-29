export const meta = {
  name: 'harvest-2',
  description: 'The six process changes this build paid for: reality first, uncertainty first, spikes before decisions, recorded fixtures, reviewed briefs, and a stopping rule',
  phases: [{ title: 'Harvest' }, { title: 'Verify' }],
}

const DST = '/Users/mike/Desktop/www/ai-dev-framework'

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    report: { type: 'string', description: 'max 30 lines' },
  },
  required: ['ok', 'report'],
}

const COMMON = `TARGET: ${DST} — the reusable framework template, a git repo whose HEAD is the previous harvest.

THE ONE RULE: the template is ABSTRACT. It is reused across unrelated products, so it must never name the project these lessons came from, its domain, or treat its stack as the framework's. A lesson learned from one external API is a lesson about external dependencies. A verifier for one kind of document is "a component whose rules are guesses about real-world text". Write each change as if the framework always knew it. A reviewer greps for leaked vocabulary at the end.

WHERE THESE COME FROM. A full product was built with this framework and then taken to production reality: a real browser, and a real external model behind the one seam the whole design rests on. The planning stages — analyst, owner, manager, teamlead, architect — produced a sound specification, and the expensive defects were not in it. They were these, and every one of them was found by running something rather than by reading something:

- A suite of several hundred tests was green while the product could not be opened at all: the web container had no network route to the api. Each test level was correct — the api tests called the server in-process, the web tests mocked the network — and nothing instantiated the seam between them.
- The whole external-provider integration — the client, the retry policy, the schema validation, the token budget — was designed and tested against a mock. The first real call failed, and the failure was ours: one configuration number was serving as both the response-length cap and the spend bound.
- The product's central guarantee, a deterministic check that generated text is supported by extracted evidence, was written from first principles and was sound as architecture. Its implementation rules were guesses about how real text behaves, and real output falsified them immediately: a date reformatted by the model ("Since 2019" → "2019 - Present") deleted a real entry, and invented organisations were being caught by a hard-coded list of famous company names.
- That last one then consumed THREE adversarial review rounds. Each round fixed the holes the previous one found and opened new ones, because the mechanism — detecting entities in free prose with pattern matching — cannot close. The orchestrator kept patching instead of re-scoping.
- Several expensive failures were in the ORCHESTRATOR'S OWN BRIEFS, not in any agent's work: a lane-isolation criterion that made every parallel lane fail by construction, an allowlist missing a file the task had to touch, and a decision written down with a sentence that was false in the dangerous direction.
- Measured across two waves and three fix rounds: not one task ever reported a capability failure. Every block was a decision, a dependency, or a defective brief.

Never commit — the Orchestrator commits. Report at most 30 lines.`

const LANES = {

'planning': `You own: ${DST}/framework/process/sprint-playbook.md, ${DST}/framework/process/orchestration.md, ${DST}/framework/sprints/SPRINT-000-template/plan.md.

Three changes to how a sprint is planned and started.

1. **THE FIRST TASK PROVES THE SEAMS, NOT THE FILE TREE.** The playbook's bootstrap task currently creates the shared files two or more lanes would touch, and ships them empty. That is right and it stays — but it is half the job. The other half: before any feature work, ONE request travels the whole assembled system end to end, across every process and network boundary the product has, and ONE real call is made to every external dependency the design rests on. It is minutes of work. In the build described above it would have moved roughly a third of the expensive findings from the last hour to the first.
   Write it as acceptance criteria a lane can be held to, not as advice. A walking skeleton that only runs inside one process is not a walking skeleton.

2. **PLAN BY UNCERTAINTY, NOT ONLY BY DEPENDENCY.** The plan template orders tasks by what depends on what, which is necessary and not sufficient. Add a required column or section: what each task assumes that might be WRONG, and how cheaply it could be checked. The highest-uncertainty items are scheduled FIRST, even when nothing depends on them, because their failure invalidates design rather than delaying it. In the build above, the three riskiest assumptions — can the browser reach the api, will the real provider obey our schema, does our matching rule survive real text — were all tested last.
   You cannot predict what the bugs will be. You can rank what you do not know.

3. **THE BRIEF IS REVIEWED BEFORE THE LANE STARTS.** Several of the most expensive failures were the Orchestrator's own briefs, and nothing reads them. Add a cheap pass — one agent, cheapest tier — that reads each lane brief against the specification and the lane allowlist and answers three questions: does every acceptance criterion trace to something the spec actually says; does the allowlist cover every file the task must touch; is the definition of "green" achievable while sibling lanes are in flight. It costs almost nothing and the one criterion it would have caught cost a whole wave.

Keep the playbook's existing shape and length discipline.`,

'decisions': `You own: ${DST}/framework/process/model-routing.md, ${DST}/framework/process/sprint-playbook.md is NOT yours (another lane has it) — use ${DST}/framework/docs/decisions.md, ${DST}/framework/knowledge/patterns.md and ${DST}/.claude/agents/architect.md.

Two changes, both about when a decision may be made from a desk.

1. **SPIKE BEFORE DECIDING, FOR ANYTHING THE WORLD GETS A VOTE ON.** The framework treats every architectural decision the same: argue it, record it with its rejected alternatives, freeze it. That works for decisions whose inputs you control — boundaries, ownership, data shapes, process. It fails for decisions about things that answer back: an external API's real behaviour, a model's real output, how real text actually looks, a library's real semantics. In the build above, a central guarantee was designed from first principles, written as a decision, implemented, tested green against fixtures somebody wrote — and falsified by the first contact with reality.
   Add the distinction to the decision process: a decision whose correctness depends on the behaviour of something outside the repository requires a SPIKE first — a timeboxed experiment against the real thing, whose OUTPUT is attached to the decision as evidence. No spike, no decision; and the record says which kind it was.
   Give the architect role the same rule: it may decide structure from a desk, and may not decide behaviour it has not observed.

2. **A STOPPING RULE FOR ADVERSARIAL REVIEW.** Adversarial review is the single highest-value role in this framework — it repeatedly found what both the author and the orchestrator missed. It also has no termination condition, and in the build above one component consumed three rounds: each fixed the previous round's holes and opened new ones, because the mechanism could not close.
   The rule: when a SECOND adversarial round on the same component produces a comparable crop of findings, that is evidence about the MECHANISM, not about the effort. The component is re-scoped or its guarantee is narrowed to what the implementation can actually keep, and the residue is written down as a stated limit. A third round is a decision the Orchestrator makes explicitly and justifies, not a default.
   Write it as a pattern with the reasoning, because a rule that only says "stop after two" will be followed in the wrong places.`,

'evidence': `You own: ${DST}/.claude/rules/testing.md, ${DST}/.claude/agents/test-engineer.md, ${DST}/.claude/agents/developer.md, ${DST}/framework/docs/testing-strategy.md.

One change, and it is the one that would have caught the most.

**FIXTURES FOR AN EXTERNAL DEPENDENCY ARE RECORDED, NOT WRITTEN.** The rules already say to mock only true externals, which is right. They do not say where the mock's CONTENT comes from, and in the build above it came from imagination: the whole integration was built against hand-written fixtures that described what the team believed the provider returns. They were plausible, they were consistent, every test passed, and the first real call failed — because the real response had a shape nobody had looked at.

The rule: the first fixture for any external dependency is a RECORDING of one real exchange, captured once, committed, and dated. Later fixtures may be edited copies of it — that is how you build the adversarial cases — but the original stays as the reference, and a hand-invented shape is never the first one. Secrets are stripped at recording time, and the recording never contains a credential.

Write it into the testing rule, the strategy document and the two role files, each in the voice of that file. Also add the smaller thing beside it: a test that mocks a boundary proves the code's behaviour at that boundary, never the boundary's own. Both halves need a test that touches the real thing somewhere.`,
}

const harvested = await parallel(Object.entries(LANES).map(([name, brief]) => () => agent(
  'You are the Architect (.claude/agents/architect.md) working on the framework template itself.\n\n' + COMMON + '\n\n=== YOUR AREA: ' + name + ' ===\n\n' + brief,
  { label: 'harvest:' + name, phase: 'Harvest', model: 'fable', schema: RESULT })))

const verify = await agent(
  'You are the code-reviewer (.claude/agents/code-reviewer.md). Project: the framework template at ' + DST + '.\n\n' +
  'Three agents have just added six process changes. They reported:\n\n' +
  harvested.map((h, i) => '— ' + Object.keys(LANES)[i] + ': ' + (h ? h.report : '(no report)')).join('\n\n') +
  '\n\nVerify:\n' +
  '1. ABSTRACTNESS. grep the tree case-insensitively for the source project\'s vocabulary — product nouns, its domain, its stack named as the framework\'s choice. Report every hit with file and line.\n' +
  '2. ACTIONABILITY, which is where process changes usually die. For each of the six — seam-proving bootstrap, uncertainty-first planning, reviewed briefs, spike-before-decision, the adversarial stopping rule, recorded fixtures — answer one question: could an agent be held to this, or is it advice? Advice looks like "consider", "where appropriate", "try to". Name every instance.\n' +
  '3. CONTRADICTIONS. The bootstrap task is now described in more than one file; the stopping rule touches the reviewer role and the decision process; the fixture rule touches four files. Confirm they agree with each other and with what the scripts actually do.\n' +
  '4. SIZE. Each file must still obey the length discipline its own header declares. A playbook nobody finishes reading enforces nothing.\n' +
  '5. Run bash framework/scripts/gate.sh in the template and confirm it still degrades cleanly with no project config.\n\n' +
  'Report at most 30 lines: the hits, the advice-not-criteria list, and what you would send back.',
  { label: 'verify', phase: 'Verify', model: 'fable', schema: RESULT })

return { lanes: harvested.map((h, i) => ({ area: Object.keys(LANES)[i], ok: !!(h && h.ok) })), verify: verify && verify.report }
