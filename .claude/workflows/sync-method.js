export const meta = {
  name: 'sync-method',
  description: 'The vendored method in this repo is older than the template it fed; bring it up to date without losing a line of the project record',
  phases: [{ title: 'Sync' }, { title: 'Review' }],
}

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, blockedOn: { type: 'string', enum: ['none','code','brief','decision','dependency'] }, report: { type: 'string', description: 'max 30 lines' }, fixes: { type: 'array', items: { type: 'string' } } },
  required: ['ok', 'blockedOn', 'report'],
}

const BRIEF = `PROJECT: /Users/mike/Desktop/www/ai-cv-builder — this repository, the deliverable.
TEMPLATE: /Users/mike/Desktop/www/ai-dev-framework — the reusable method, which this project's findings were harvested into (B-024). It is a git repo: 3efc0ee is pre-harvest, HEAD is after, so \`git -C <template> diff 3efc0ee HEAD -- <path>\` shows exactly what each file gained and why.

THE PROBLEM. This repository vendors the method under framework/ and .claude/ so a reviewer can read it. But sixteen findings were harvested OUT of this project INTO the template, and the copies here were never brought back up to date. So framework/knowledge/framework-feedback.md says all sixteen are applied while the files in this repo are the versions that caused them, and three scripts the method now relies on — wave.sh, hook-pretool.sh, and the template's smoke step — do not exist here at all. Every method file differs. A reviewer who reads the claim and then the file finds a contradiction.

YOUR JOB: make the vendored method current, and make it worth reading.

Hard boundaries — these are the project's own record and you do not touch them:
- framework/docs/** (the specification, 21 ADRs, contracts, architecture)
- framework/sprints/** (plan, lane logs, reports, QA report and screenshots, board, HISTORY)
- framework/knowledge/** (errors.md, patterns.md, framework-feedback.md)
- framework/STATE.md, framework/scripts/gate.config.sh, README.md, SUMMARY.md
Everything else under framework/ and .claude/ is method and is yours.

This is a RECONCILIATION, not a copy. For each differing file, read both versions and the template's diff since 3efc0ee, then decide — and say in your report which way each went and why:
- The template is newer for the process playbooks, the rules, the role files, the escalation section, the bootstrap pattern, the allowlist allowance, the merge policy's rewritten Mode B, the port rule, and .claude/workflows/sprint.js (which gained blockedOn routing, a fix cycle, a two-attempt ladder returning both reports, table validation before the wave marker, and array allowlists).
- This PROJECT is ahead in places, and where it is, the project wins and the template's version is NOT imported. Known cases: the smoke check here is a real vitest suite under tests/smoke/ wired into gate.config.sh, while the template ships a shell placeholder; gate.config.sh is this project's filled-in config and has no counterpart. Look for others before overwriting anything.
- Where a template file references something this repo does not have, either bring the thing across (wave.sh, hook-pretool.sh) and wire it, or change the reference. A method that names a script nobody can run is the exact defect FF-12 and FF-15 were about.

Then two additions that are the difference between "vendored" and "worth reading":
1. framework/README.md — one screen, for a reviewer opening this repo cold: what this directory is, why a product repository contains a development method, the loop in five lines, where the enforcement actually lives (gate.sh, check-lane.sh, the hooks), and which four files to read first. No marketing. It should read like a map, not a pitch.
2. .claude/workflows/README.md — short. sprint.js is the reusable runner; the other scripts are the actual per-wave and per-fix runs from this build, kept deliberately as the record of how the work was really driven. Say which is which, so a reviewer reads them as evidence rather than as clutter.

VERIFY, and this is the part that matters:
- \`bash framework/scripts/gate.sh\` must be green at the end. The hooks and the config must still work.
- \`bash framework/scripts/check-lane.sh\` must work in whatever form the method now documents, and the documented usage in CLAUDE.md and the reviewer role file must match the script. That exact mismatch was a finding twice.
- grep the vendored method for any reference to a file that does not exist in this repo.
- Confirm that nothing under the hard boundaries above changed: \`git status\` must show no modifications there.

Never commit; the Orchestrator commits. Report at most 30 lines.`

const dev = await agent('You are the Architect (.claude/agents/architect.md).\n\n' + BRIEF +
  '\n\nYour step: do the reconciliation, then run the checks.',
  { label: 'sync', phase: 'Sync', model: 'fable', schema: RESULT })

const review = await agent('You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + BRIEF +
  '\n\nThe architect reported:\n' + (dev ? dev.report : '(no report)') +
  '\n\nYour step: verify rather than accept.\n' +
  '1. Run the full gate yourself and report the counts.\n' +
  '2. `git status --short` — confirm NOTHING changed under framework/docs/, framework/sprints/, framework/knowledge/, STATE.md, gate.config.sh, README.md or SUMMARY.md. A single modification there is a blocking finding.\n' +
  '3. Take three findings at random from framework/knowledge/framework-feedback.md, each marked applied, and check that the file it names in THIS repo now actually carries the fix. If one does not, the claim in that file is still false and you say so.\n' +
  '4. grep the vendored method for references to scripts or paths that do not exist here, and run every command the method tells an agent to run.\n' +
  '5. Read framework/README.md as if you had never seen this repo: does it orient you in one screen, and is there a sentence in it that is not true?\n' +
  'Report at most 25 lines.',
  { label: 'review', phase: 'Review', model: 'haiku', schema: RESULT })

return { dev: !!(dev && dev.ok), review: !!(review && review.ok), devReport: dev && dev.report, reviewReport: review && review.report }
