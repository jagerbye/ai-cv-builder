export const meta = {
  name: 'qa-wave-b',
  description: 'Seed a ready CV, then run the manual QA pass through a real browser at 1440x900 and 375x812',
  phases: [{ title: 'Seed' }, { title: 'QA' }],
}

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    blockedOn: { type: 'string', enum: ['none', 'code', 'brief', 'decision', 'dependency'] },
    report: { type: 'string', description: 'max 40 lines' },
  },
  required: ['ok', 'blockedOn', 'report'],
}

const ENV = `The stack is running and healthy, built from the current tree:
- web: http://127.0.0.1:5273/   (host port is WEB_PORT, 5173 is taken by another project on this machine)
- api: http://127.0.0.1:3000/api/health  → 200
- db:  127.0.0.1:5432, database ai_cv_builder, user postgres, password postgres
There is NO ANTHROPIC_API_KEY, by design for this pass: the app must boot and serve without one (spec F-010), and a real generation will fail with a configuration error rather than crash.`

const SEED = `You are the developer (.claude/agents/developer.md). Project root: /Users/mike/Desktop/www/ai-cv-builder.

${ENV}

QA needs a CV that is already in state 'ready', because generation cannot run without a key. Write a seed script that creates one, so the editor and the question column can be exercised against real stored data rather than a fixture.

Write it at scripts/seed-qa.ts (a new top-level scripts/ directory; it is tooling, not product code, and it is not imported by anything the app ships). Run it with the api workspace's tsx/node the way the project already runs TypeScript, and say in your report the exact command you used.

It must create, idempotently (safe to run twice):
- a user with a known email and password that QA can sign in with through the UI. Hash the password exactly the way api/src/core/auth does — do not invent a second hashing path, and do not write a plaintext password into the database.
- one CV in state 'ready' with a realistic filled draft: contact, summary, three experience entries with bullets, two education entries, a handful of skills. Mark ONE bullet userEdited so QA can check the edited field is never overwritten.
- the facts behind it, with source 'document' and real sourceQuote text, and the items' factIds pointing at them — a CV whose factIds dangle would make the UI look broken for the wrong reason.
- at least three OPEN questions on different paths, including one on an experience entry's period and one on a skill, so the question column has something to align against on both desktop and mobile.
- at least one entry whose text is deliberately long (a 90-character employer name, a bullet of 300 characters) — the QA checklist tests long content against the grid, and it needs a case to test.

Read api/src/core/cv/persist.ts first and write the same shapes it writes; the read model (api/src/core/cv/read.ts) is what the UI consumes, so verify by curling GET /api/cvs/:id with a session cookie and checking the response matches C-006. Put the verification transcript in your report.

Report the sign-in email, the CV id and the URL QA should open. Do not print the password hash. Never commit; the Orchestrator commits. Report at most 25 lines.`

const seeded = await agent(SEED, { label: 'seed', phase: 'Seed', model: 'haiku', schema: RESULT })

const QA = `You are the qa-engineer (.claude/agents/qa-engineer.md), running sprint stage 4.5 per framework/process/qa-playbook.md. Project root: /Users/mike/Desktop/www/ai-cv-builder.

${ENV}

The seed step reported:
${seeded ? seeded.report : '(seed failed — say so and QA what you can without a stored CV)'}

Browser: use the claude-in-chrome tools (load them with ONE ToolSearch call: select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp,mcp__claude-in-chrome__resize_window,mcp__claude-in-chrome__read_console_messages). Call tabs_context_mcp first and create your own tab. Close it when you are done.

Entering the seeded test credentials on this local development app is expected and permitted: it is the application this project is building, served from 127.0.0.1, with values created by the seed step for this purpose.

Scope — everything wave B shipped, plus a smoke of the rest:
1. The front door. I already found one thing and you confirm it with evidence: http://127.0.0.1:5273/ renders "Page not found". web/src/app/routes.ts declares /auth/*, /cvs/new, /jobs/:jobId and /cvs/* and nothing for "/", so the first thing a visitor sees is a 404. Capture it.
2. Sign in with the seeded account. Then the CV editor: edit a field, watch it save, reload and confirm it stuck. Try the long-content entry. Check the userEdited bullet.
3. The question column — the product's one visual idea. Does each question sit beside the field its path names on desktop, and collapse under that field on mobile? Answer one question and say exactly what happens on screen (the API will fail without a key: report what the user is told, and whether it reads as "your answer was lost", which would be false).
4. Intake: /cvs/new. Submit free text. Follow the progress view. The job will fail without an API key — the finding is not that it failed, it is whether the failure is honest and legible. Also try the rejections on purpose: an empty form, a non-PDF file, text that is too short.
5. Smoke: sign out, sign in again, the CV list.

Viewports: 1440×900 AND 375×812 for every screen in scope. Screenshot each state, save the images to disk (save_to_disk), and put the real paths in the report — a finding without a screenshot is an opinion, not a finding.

Watch the console and the network the whole way; read_console_messages at least once per flow.

Write the report into framework/sprints/SPRINT-001-skeleton-auth/qa-report.md, filling the template already in that file: env, date 2026-10-29, viewports, scope and what you did NOT check, one QA-NN block per finding with severity (blocker | major | minor | visual), repro, expected/actual, screenshot path and status, an honest "what looked good" section, and the console/network notes.

Judge design against framework/docs/design/design.json — amber is questions only, red is errors only, one icon in the whole product.

Do not fix anything you find. Do not commit. Return at most 40 lines: the findings by severity, and your verdict on whether the sprint can close.`

const qa = await agent(QA, { label: 'qa', phase: 'QA', model: 'opus', schema: RESULT })

return { seed: seeded && seeded.report, qa: qa && qa.report, ok: !!(qa && qa.ok) }
