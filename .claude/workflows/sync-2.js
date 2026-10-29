export const meta = { name: 'sync-2', description: 'The vendored method fell behind the template again after the second harvest', phases: [{ title: 'Sync' }] }
const RESULT = { type: 'object', properties: { ok: { type: 'boolean' }, report: { type: 'string', description: 'max 25 lines' } }, required: ['ok','report'] }

const BRIEF = `PROJECT: /Users/mike/Desktop/www/ai-cv-builder — the deliverable, which vendors the method under framework/ and .claude/ so a reviewer can read it.
TEMPLATE: /Users/mike/Desktop/www/ai-dev-framework — a git repo. HEAD carries a SECOND harvest (commit "Six process changes this build paid for"), and the project never received it.

THE PROBLEM, and it is the same one this project already fixed once. A first sync brought the vendored copy up to date; then six more process changes were harvested into the template and not brought back. So the project's own framework/ is behind again: sprint-playbook.md, .claude/rules/testing.md and .claude/agents/teamlead.md differ, and framework/scripts/record.sh does not exist here at all — while the rules that reference it do. A method that names a script nobody can run is the defect two of this project's own findings were about.

Bring the vendored method up to date. The rules are unchanged from last time:
- RECONCILE, do not copy. Read both versions and the template's diff for each file.
- The template is newer for the six process changes: the seam-proving bootstrap, uncertainty-first planning, the reviewed brief, spike-before-decision with its timebox, the adversarial stopping rule with its threshold, and recorded-not-written fixtures with record.sh.
- Where the PROJECT is ahead, the project wins and nothing is imported. Known: gate.config.sh is filled in here and absent there; the smoke check here is a real vitest suite wired into the gate, not the template's shell placeholder. LOOK for others before overwriting anything.
- HARD BOUNDARIES, do not touch: framework/docs/**, framework/sprints/**, framework/knowledge/**, framework/STATE.md, framework/scripts/gate.config.sh, README.md, SUMMARY.md. Those are the project's own record. \`git status\` must show nothing modified there when you are done.
- record.sh comes across and is wired where the rules say it is.

VERIFY: \`bash framework/scripts/gate.sh\` green; every command the method tells an agent to run actually runs; grep the vendored method for references to files that do not exist here; and confirm the boundaries above are untouched.

Never commit; the Orchestrator commits. Report at most 25 lines, and list each file with which way it went and why.`

const dev = await agent('You are the Architect (.claude/agents/architect.md).\n\n' + BRIEF, { label: 'sync', phase: 'Sync', model: 'fable', schema: RESULT })
return { ok: !!(dev && dev.ok), report: dev && dev.report }
