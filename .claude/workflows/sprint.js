// sprint.js — deterministic runner for SPRINT-001-skeleton-auth.
//
// Executes stage 3 of framework/process/sprint-playbook.md: per task —
// test-engineer (RED) → developer (GREEN) → reviewer, with the Sonnet retry
// from the escalation ladder (framework/process/model-routing.md).
//
// Lane 01 is a blocking prologue: nothing can be typechecked, tested or
// migrated before the workspace and the schema exist. Lanes 02 and 03 run in
// parallel afterwards — disjoint file areas, both coding against the frozen
// contracts C-000..C-002, not against each other.

export const meta = {
  name: 'sprint-001',
  description: 'SPRINT-001 skeleton & auth — foundation, then api-auth and web lanes in parallel, tests first per task',
  phases: [
    { title: 'Tests', detail: 'test-engineer writes failing tests from the acceptance criteria' },
    { title: 'Code', detail: 'developer makes them green; Sonnet retry on failure' },
    { title: 'Review', detail: 'code-reviewer runs the gate and checks the diff against the criteria' },
  ],
}

const PREAMBLE = [
  'Project root: /Users/mike/Desktop/www/ai-cv-builder (git repo, base ref c714618 — docs only, no code yet).',
  'Sprint: framework/sprints/SPRINT-001-skeleton-auth/.',
  'Context budget: read ONLY the paths named under "Read first". Do not browse the docs tree.',
  'Before coding, grep framework/knowledge/errors.md for the keywords named in your task.',
  'Report: append your block to the lane file named below, in the template already in that file. Keep it under 30 lines.',
  'Also flip your task row in framework/sprints/SPRINT-001-skeleton-auth/plan.md (Status board) as you finish your step.',
].join('\n')

const TASKS = {
  'T-01': {
    lane: '01',
    file: 'framework/sprints/SPRINT-001-skeleton-auth/lanes/lane-01.md',
    brief: `Task T-01: stand up the TypeScript workspace and make framework/scripts/gate.sh green on it.

Acceptance criteria (B-001, spec.md §4):
- npm workspaces "api" and "web" at the repo root. Root scripts typecheck, lint, test, build each fan out to both workspaces and exit non-zero when a workspace fails.
- framework/scripts/gate.sh exits 0 on the resulting tree, and .github/workflows/ci.yml runs that same script (do not duplicate the commands in CI).
- One placeholder test per workspace that asserts a real value — not expect(true).toBe(true). The stub-test rule in .claude/rules/testing.md applies from the first commit.
- Install EVERY dependency listed in framework/docs/architecture.md §1 for both workspaces now, with pinned exact versions. This task is the single owner of package.json and the lockfile for the whole project; later lanes must never touch them. Node 24 is what runs locally; the containers target Node 22, so do not pin engines above 22.
- Vitest config per workspace, path aliases if you add any must be mirrored in tsconfig.

Files you may touch: package.json, package-lock.json, tsconfig.base.json, api/ and web/ scaffolding (tsconfig, vitest.config.ts, src/index placeholder, one test each), .eslintrc.cjs or eslint.config.js, .github/workflows/ci.yml, .nvmrc.

Read first: framework/docs/architecture.md §1, framework/docs/testing-strategy.md §Commands, framework/scripts/gate.config.sh, framework/scripts/gate.sh.

Do NOT: write any feature code, add a dependency that is not in architecture.md §1, change framework/ docs, or touch .claude/.

Note for the test-engineer step only: until package.json exists the gate CANNOT be green — that is the expected RED. Write the placeholder tests, state plainly that the gate is red because the workspace does not exist yet, and stop. Do not try to satisfy the gate.

Lane test command: npm run -s test`,
  },
  'T-02': {
    lane: '01',
    file: 'framework/sprints/SPRINT-001-skeleton-auth/lanes/lane-01.md',
    brief: `Task T-02: bring up the compose stack and create the full database schema.

Acceptance criteria (B-002):
- docker compose up from a clean clone starts db (postgres:16), api and web. The api container runs prisma migrate deploy before it listens. The printed URL serves the web app.
- GET /api/health returns { ok: true, db: true } and is covered by a test.
- api/prisma/schema.prisma and the initial migration define ALL SIX tables exactly as framework/docs/database-schema.md specifies them: users, sessions, cvs, facts, cv_items, questions, generation_jobs — columns, check constraints and every listed index. This task owns the migration directory for the whole project; later sprints add migrations, they never rewrite this one.
- The two PARTIAL indexes on generation_jobs cannot be expressed in Prisma schema language — write them as raw SQL inside the generated migration. Do not invent a Prisma feature for this; if it fights you twice, say so in the report instead of improvising.
- .env.example lists ANTHROPIC_API_KEY and DATABASE_URL and nothing secret.
- The api boots with ANTHROPIC_API_KEY unset (spec.md F-010) — assert this in a test.

Files you may touch: docker-compose.yml, api/Dockerfile, web/Dockerfile, .dockerignore, .env.example, api/prisma/**, api/src/db/**, api/src/server.ts, api/src/routes/health.ts, api/src/env.ts, tests for the above.

Read first: framework/docs/database-schema.md (whole file), framework/docs/architecture.md §5, framework/docs/spec.md §3.10 (the ANTHROPIC_API_KEY criterion only).

Do NOT: implement auth, CVs or jobs — tables and health only; touch package.json (T-01 owns it); touch web/src beyond what the Dockerfile needs.

Lane test command: npm -w api run test -- --run src/db src/routes/health

Grep framework/knowledge/errors.md for: prisma, docker, migration.`,
  },
  'T-03': {
    lane: '02',
    file: 'framework/sprints/SPRINT-001-skeleton-auth/lanes/lane-02.md',
    brief: `Task T-03: registration.

Acceptance criteria (spec.md F-001, contract C-001 — read them, they are the test list):
- POST /api/auth/register with a valid email and a password of at least 10 characters creates a user, returns 201 { user: { id, email } } and sets the session cookie.
- The stored password is an argon2id hash. The plaintext appears in no log, no error and no response — assert this.
- A duplicate email returns 409 with a generic message that does not confirm the address exists.
- Invalid email, short password or a missing field returns 400 with the field-level details array from C-000. No user is created.
- Every non-2xx response uses the C-000 error envelope with a code from the closed enum. Build that serializer here — lane 03 and every later lane depend on its shape.

Files you may touch: api/src/core/auth/**, api/src/routes/auth.ts, api/src/http/errors.ts, tests/contract/auth-register.test.ts, api/src/core/auth/*.test.ts.

Read first: framework/docs/api-contracts.md C-000 and C-001, framework/docs/domain-model.md (User and Session blocks), .claude/rules/security.md.

Do NOT: implement login, sessions or logout (that is T-04); touch anything under web/; touch package.json or the prisma schema — both already contain what you need.

Lane test command: npm -w api run test -- --run src/core/auth tests/contract/auth-register

Grep framework/knowledge/errors.md for: argon2, fastify, zod.`,
  },
  'T-04': {
    lane: '02',
    file: 'framework/sprints/SPRINT-001-skeleton-auth/lanes/lane-02.md',
    brief: `Task T-04: login, session cookie, and the ownership guard every later lane will use.

Acceptance criteria (spec.md F-001, contract C-002, ADR-007):
- POST /api/auth/login returns 200 { user: { id, email } } and sets the session cookie; wrong password and unknown email return 401 with the IDENTICAL message.
- The cookie is httpOnly, SameSite=Lax, 30-day expiry; only the sha256 of the opaque token is stored in sessions. The raw token exists only in the cookie.
- POST /api/auth/logout returns 204, deletes the session row, and is idempotent.
- GET /api/auth/me returns the user or 401.
- requireUser is a route hook that returns 401 and performs no work when the session is missing, invalid or expired.
- assertOwnership(userId, entity) throws NotFound — never Forbidden — so another user's row is indistinguishable from a missing one. Prove it with a test: user A requesting user B's resource gets 404.
- The session survives a reload and works from a second client with the same cookie.

Files you may touch: api/src/core/auth/**, api/src/routes/auth.ts, api/src/http/requireUser.ts, api/src/http/errors.ts, tests/contract/auth-session.test.ts.

Read first: framework/docs/api-contracts.md C-002, framework/docs/decisions.md ADR-007, framework/docs/domain-model.md (Session block), .claude/rules/security.md.

Do NOT: add rate limiting (that is B-019 in sprint 3); add JWT — ADR-007 chose sessions and an ADR is not re-litigated; touch web/.

Lane test command: npm -w api run test -- --run src/core/auth tests/contract/auth-session

Grep framework/knowledge/errors.md for: cookie, session, fastify.`,
  },
  'T-05': {
    lane: '03',
    file: 'framework/sprints/SPRINT-001-skeleton-auth/lanes/lane-03.md',
    brief: `Task T-05: the web shell.

Acceptance criteria (B-005, spec.md F-009):
- React + Vite + TanStack Query app with a router split into a public branch and a protected branch.
- A typed API client that parses the C-000 error envelope: it surfaces error.message to the UI and exposes error.details for field-level errors. Every later screen uses it, so get its shape right.
- Design tokens taken from framework/docs/design/design.json — no hardcoded colours or spacing values in components.
- Mobile-first layout: at 375x812 there is no horizontal scroll, tap targets are at least 44x44 px, no text below 14 px. Single column on narrow viewports, two columns from 900 px up.
- One smoke render test per screen that asserts real content, not a truthy value.

Files you may touch: web/** only.

Read first: framework/docs/api-contracts.md C-000, framework/docs/design/README.md and design.json, framework/docs/spec.md §3.9.

Do NOT: touch any file under api/; touch package.json; build the intake, editor or CV-list screens (sprints 2 and 3); add a UI component library that is not in framework/docs/architecture.md §1.

Lane test command: npm -w web run test -- --run

Grep framework/knowledge/errors.md for: vite, tanstack, react.`,
  },
  'T-06': {
    lane: '03',
    file: 'framework/sprints/SPRINT-001-skeleton-auth/lanes/lane-03.md',
    brief: `Task T-06: the auth screens.

Acceptance criteria (spec.md F-001 from the user's side, contracts C-001 and C-002):
- Sign-up and log-in forms that show inline field errors taken from the error envelope's details array, and the generic message for 401 and 409.
- A protected /cvs route showing an empty state ("no CVs yet") — its content is sprint 3's work, the route and the guard are yours.
- On mount the app calls GET /api/auth/me and restores the session, so a reload stays signed in and an unauthenticated visitor is redirected to log in without a flash of protected content.
- Log out returns to the public branch and clears the cached user.
- Both screens pass the F-009 mobile criteria from T-05.

Files you may touch: web/src/features/auth/**, web/src/routes/**, their tests.

Read first: framework/docs/api-contracts.md C-001 and C-002, framework/docs/spec.md §3.1.

Do NOT: touch api/; add "remember me", password-strength meters or a password-reset link — all explicitly out of scope in spec.md §3.1; call the API anywhere except through the client from T-05.

Lane test command: npm -w web run test -- --run src/features/auth src/routes`,
  },
}

const RESULT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true only if the step fully met its criteria' },
    report: { type: 'string', description: 'max 30 lines: what was done, gate result, anything the next step must know' },
  },
  required: ['ok', 'report'],
}

async function runTask(id) {
  const t = TASKS[id]
  const head = PREAMBLE + '\nLane file: ' + t.file + '\n\n' + t.brief + '\n\n'

  const red = await agent(
    'You are the test-engineer (.claude/agents/test-engineer.md).\n\n' + head +
    'Your step: write the failing tests for these acceptance criteria and nothing else. No production code. Confirm RED by running the lane test command and reporting what failed and why.',
    { label: 'tests:' + id, phase: 'Tests', model: 'haiku', schema: RESULT })

  let dev = await agent(
    'You are the developer (.claude/agents/developer.md).\n\n' + head +
    'Tests exist and are RED. The test-engineer reported:\n' + (red ? red.report : '(no report — tests may be missing; write them first, then the code)') +
    '\n\nYour step: make them green. Run the lane test command, then framework/scripts/gate.sh. Update any doc the docs-sync rule names for what you touched.',
    { label: 'dev:' + id, phase: 'Code', model: 'haiku', schema: RESULT })

  if (!dev || !dev.ok) {
    log('escalating ' + id + ' to Sonnet (model-routing ladder step 2)')
    dev = await agent(
      'You are the developer (.claude/agents/developer.md).\n\n' + head +
      'A previous attempt by a cheaper model failed. Its report:\n' + (dev ? dev.report : '(the attempt produced no report at all)') +
      '\n\nYour step: diagnose what it actually got wrong, fix it properly rather than patching symptoms, and get framework/scripts/gate.sh green. If the brief itself is defective, say so in your report instead of improvising around it.',
      { label: 'dev-retry:' + id, phase: 'Code', model: 'sonnet', schema: RESULT })
  }

  const review = await agent(
    'You are the code-reviewer (.claude/agents/code-reviewer.md).\n\n' + head +
    'The developer reported:\n' + (dev ? dev.report : '(no report)') +
    '\n\nYour step: review the diff against the acceptance criteria above. Run framework/scripts/gate.sh yourself — do not take the developer\'s word for it. Run framework/scripts/check-lane.sh c714618 with this task\'s allowed file list and fail the task if files outside it were touched. Apply the stub-test lens from .claude/rules/testing.md: would a hard-coded happy value pass this suite? Append your verdict to the lane file.',
    { label: 'review:' + id, phase: 'Review', model: 'haiku', schema: RESULT })

  return {
    id,
    lane: t.lane,
    dev: dev ? dev.ok : false,
    review: review ? review.ok : false,
    notes: review ? review.report : 'reviewer produced no report',
  }
}

// Lane 01 — blocking prologue. Everything below needs the workspace and schema.
log('lane 01 (prologue): workspace, compose stack, schema')
const foundation = []
for (const id of ['T-01', 'T-02']) foundation.push(await runTask(id))

if (foundation.some(t => !t.dev)) {
  log('foundation failed — lanes 02 and 03 cannot start on a tree that does not build')
  return { lanes: [{ lane: '01', tasks: foundation }], needsAttention: foundation.filter(t => !t.dev || !t.review), stopped: 'foundation' }
}

// Lanes 02 and 03 — disjoint areas, both against frozen contracts.
log('lanes 02 (auth) and 03 (web) in parallel')
const parallelLanes = await parallel([
  async () => { const out = []; for (const id of ['T-03', 'T-04']) out.push(await runTask(id)); return { lane: '02', tasks: out } },
  async () => { const out = []; for (const id of ['T-05', 'T-06']) out.push(await runTask(id)); return { lane: '03', tasks: out } },
])

const lanes = [{ lane: '01', tasks: foundation }, ...parallelLanes.filter(Boolean)]
return { lanes, needsAttention: lanes.flatMap(l => l.tasks.filter(t => !t.dev || !t.review)) }
