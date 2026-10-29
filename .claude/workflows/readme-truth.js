export const meta = {
  name: 'readme-truth',
  description: 'The README still says the product does not do things it now does, and it is the graded deliverable',
  phases: [{ title: 'Fix' }],
}

const RESULT = {
  type: 'object',
  properties: { ok: { type: 'boolean' }, report: { type: 'string' } },
  required: ['ok', 'report'],
}

const BRIEF = `You are the developer (.claude/agents/developer.md). Project root: /Users/mike/Desktop/www/ai-cv-builder.

README.md is the deliverable this whole project is judged on, and its Status section is now false in the understating direction — which is the rarer and more embarrassing kind. It still says generation does not run end to end, that nothing starts the worker, and that answering a question and regenerating are not routed. All three are wrong now: api/src/main.ts starts the worker and reconciles crashed CVs at boot, and api/src/routes/cvs.ts routes both the answer and the regenerate endpoints.

Your task: make every sentence in the README true again, and verify each one by running it rather than by reading the code.

- Status: what works end to end today, and what genuinely does not. The honest remaining gap is that no real generation has run, because there is no ANTHROPIC_API_KEY on this machine — the pipeline is exercised against the mocked C-012 seam everywhere. Say exactly that; do not imply a real model call has been proven, and do not imply it cannot work.
- Running it: run the commands yourself against a clean start and report what they printed.
- Tests: run them. api, web and the smoke suite have separate counts; the gate runs all three. Mention that the suite uses its own database (ADR-019) and the app keeps the other — someone running tests while clicking through the app needs to know.
- Architecture and the anti-hallucination section: check them against the code as it stands now, including the parts that changed after they were written — the deterministic read ordering, lastError, the two new error codes.
- The cuts table and the "how AI was used" section: still true? Anything cut that is now built, or built that is now cut?
- Add nothing promotional. If something is thin, the README says it is thin.

Files: README.md only. If a command fails because of a defect elsewhere, that is a finding — report it, do not fix it from here.

Never commit; the Orchestrator commits. Report at most 20 lines: what you changed and the transcript lines that justify the Status claims.`

const dev = await agent(BRIEF, { label: 'readme', phase: 'Fix', model: 'sonnet', schema: RESULT })
return { ok: !!(dev && dev.ok), report: dev && dev.report }
