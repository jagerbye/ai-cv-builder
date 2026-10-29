export const meta = {
  name: 'harvest-2-fix',
  description: 'The new process rules cite statistics nobody measured, and three roles were never told about them',
  phases: [{ title: 'Fix' }],
}

const DST = '/Users/mike/Desktop/www/ai-dev-framework'
const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, report: { type: 'string', description: 'max 25 lines' } },
  required: ['ok', 'report'],
}

const BRIEF = `TARGET: ${DST}, the framework template. Its working tree holds six new process rules, uncommitted. The template is ABSTRACT: never name the project these lessons came from, its domain, or its stack.

A reviewer checked the six against the rest of the tree and sent back five items. Fix them.

1. **THE NEW RULES CITE STATISTICS NOBODY MEASURED.** sprint-playbook.md says "roughly a third of the expensive late findings", "the three assumptions that turned out false were the three tested last"; orchestration.md says the brief check "almost never blocks". These are impressions from one project written as data — and the framework's own \`.claude/rules/research-integrity.md\` says every claim carries a source or the explicit mark "(assumption, unverified)", with no third option. The template is caught by its own rule.
   Fix by removing the numbers, not by sourcing them. A rule is followed because its reasoning is sound, and these read as evidence that does not exist. Say *what goes wrong* and let that carry the weight.

2. **THREE ROLES WERE NEVER TOLD.** \`.claude/agents/code-reviewer.md\` is not updated, though the new testing rule says "the reviewer greps the recording before it lands" and the boundary rule needs a smoke check it does not mention. \`.claude/agents/teamlead.md\` still says to order tasks by dependency, while the new planning rule says uncertainty first and the decision rules say the Teamlead schedules the spike. And the lane brief template in sprint-playbook §2 never gained the fields the plan template now says get pasted into it.
   A rule that lives only in a playbook is a rule the agent doing the work never reads.

3. **THE STOPPING RULE HAS NO THRESHOLD.** patterns.md says a second adversarial round producing "a comparable number and kind" of findings means stop — and then says it is not a count, without giving any other test. Give it one a reviewer can apply without arguing: the reviewer's recommendation was "second-round findings at least half the first, and none of them regressions → stop". Use that or something equally checkable, and keep the reasoning that explains why it is about the mechanism rather than the effort.
   Also give the spike an actual timebox in the decision record's field — "hours, not days" is not a number anyone can be held to.

4. **THE CAPTURE SCRIPT HAS NO OWNER.** The testing rule and the strategy both refer to fixtures taken "by the capture script", and no such script exists and no role is named as its author. Either ship a small \`framework/scripts/record.sh\` skeleton — read a URL or command from the environment, write the response under the recorded-fixtures directory, strip nothing it cannot strip safely, and refuse to write a file containing anything that looks like a credential — or name the role that writes it in the first capture task. Shipping the skeleton is better: it makes the rule real on day one.

5. **ONE-LINE RECONCILIATIONS.** qa-playbook.md and merge-policy.md still describe the old bootstrap task. testing-strategy.md gives edited fixtures to the developer while test-engineer.md gives them to the test-engineer; pick one and make both say it.

Also: sprint-playbook grew by nearly half. Removing the pseudo-statistics in item 1 recovers some of it; if a section still does not earn its length, cut it.

Never commit; the Orchestrator commits. Report at most 25 lines, and list anything you chose not to change and why.`

const dev = await agent('You are the Architect (.claude/agents/architect.md) working on the framework template itself.\n\n' + BRIEF,
  { label: 'fix', phase: 'Fix', model: 'fable', schema: RESULT })

return { ok: !!(dev && dev.ok), report: dev && dev.report }
