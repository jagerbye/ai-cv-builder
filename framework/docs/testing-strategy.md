# testing-strategy.md — how this project proves correctness

> **What this file is:** the testing contract: what kinds of tests exist,
> where they live, what each must cover, and what "green" means. The TDD loop
> in `framework/process/sprint-playbook.md` §3 refers here for the definitions.
> **Who writes it:** Architect + test-engineer agent, once per project; then
> updated by ADR only.
> **Who reads it:** test-engineer (writes tests first), developers, reviewer.

## Test pyramid

| Level | Lives in | Written by | Must cover |
|---|---|---|---|
| Unit | next to code (`*.test.ts`) | developer (after test-engineer's cases) | invariants from domain-model.md |
| Contract | `tests/contract/` | test-engineer | every frozen contract C-NNN, incl. error cases |
| Integration/e2e | `tests/e2e/` | test-engineer | acceptance criteria of each feature F-NNN |

## Rules

1. **Tests first.** A task starts with failing tests derived from acceptance
   criteria; code exists to make them green. A task with no testable
   criteria goes back to the Teamlead.
2. **Tests are the lane boundary's proof.** A lane may not touch another
   lane's tests; the Integrator runs the union.
3. **No test deletion to go green.** Weakening/removing a failing test
   requires reviewer sign-off and a line in `framework/knowledge/errors.md` explaining
   why the test was wrong.
4. **Flaky = broken.** A flaky test is fixed or quarantined with a task,
   never retried-until-green.

## Project specifics

### The LLM is mocked at exactly one seam

`AnthropicGateway` (C-012) is the only module importing `@anthropic-ai/sdk`.
Tests substitute a fake gateway that replays recorded fixtures from
`tests/fixtures/llm/`. Consequences, all enforced by tests:

- The suite runs with no network and no `ANTHROPIC_API_KEY`. A test that would
  make a real call is a bug, not a slow test.
- `compose` is asserted never to receive `Cv.sourceText` — the structural half
  of ADR-002.
- Error paths are first-class fixtures: 429, 529, a malformed tool result, a
  schema-violating result, a timeout.

### Where the test density goes (risk-weighted, not uniform)

The brief says to cut features rather than reliability, so coverage is spent
where a failure is invisible to the eye:

| Area | Level | Why it earns the tests |
|---|---|---|
| `verify()` groundedness | unit, **golden fixtures** | the product's promise; a silent failure here is undetectable in the UI |
| adversarial sources | unit | prompt injection, empty source, missing dates, first-person text, ambiguous role — 5 fixtures minimum (F-004) |
| ownership / authz | contract | a leak here is the worst bug the app can have; every `/api/cvs*` route gets an "other user's id → 404" case |
| job lifecycle | integration | dead-worker reclaim, double-enqueue rejection, timeout → `failed`, restart mid-run |
| `PATCH` concurrency | contract | stale version → 409, `userEdited` preserved across regenerate |
| PDF output | integration | bytes are parsed back and asserted to contain selectable name/employer/bullet strings + A4 page box |
| error envelope | contract | one shape, closed code enum, no stack trace or prompt text in any response |

Deliberately thin: React component rendering (one smoke render per screen),
CSS/layout (manual QA covers it with screenshots), the happy path of auth
(covered by the contract tests the authz cases already need).

### The stub test, applied here

`.claude/rules/testing.md` forbids a suite a hard-coded happy value could pass.
Concretely: the groundedness tests must include at least one fixture where the
*correct* behaviour is to **drop** content and raise a question — a verifier
that returns `accepted = draft` unchanged must fail the suite.

**A test whose premise is an absent environment variable must UNSET it** (`vi.stubEnv(NAME, undefined)` plus `vi.unstubAllEnvs()`), never rely on the machine agreeing: a developer's `.env` sets it, and the SDK and loaders read it (ADR-019's isolation rule, for variables).

## Commands

The single source of "green" is `framework/scripts/gate.config.sh` (run via
`framework/scripts/gate.sh` — same script for hooks, CI, agents and humans).

Lane-scoped commands, for use in lane briefs while other lanes are in flight
(never the bare union runner — `framework/knowledge/errors.md` E-001):

| Lane area | Command |
|---|---|
| api unit+contract | `npm -w api run test -- --run <path glob>` |
| generation only | `npm -w api run test -- --run src/core/generation` |
| web | `npm -w web run test -- --run <path glob>` |
| e2e | `npm run test:e2e` (Integrator and CI only) |

**Which database is which (ADR-019).** `ai_cv_builder` is the app's: `docker compose up`
serves it, QA clicks through it, and the smoke suite runs against it because its subject
is the real stack. `ai_cv_builder_test` is the suite's: `gate.sh` creates and migrates it
and forces `DATABASE_URL` to it, CI does the same by running the gate, and a bare
`npx vitest run` from `api/` defaults to it. The suite lock, leak guard and delete-by-id
rule stay, since parallel suites still share the test database.

Any test that commits a **non-terminal** `generation_jobs` row goes through
the job-queue helper, which takes the suite lock for you (ADR-014, E-002).
The queue is global by design, so a committed queued row is visible to every
other file's worker.

## Fixtures for an external dependency

The first fixture for anything outside this repository — a provider response, a
webhook body, a third-party file — is a **recording of one real exchange**,
captured with `framework/scripts/record.sh`, secrets stripped at capture time,
committed under `tests/fixtures/recorded/` and dated. Later fixtures may be
edited copies of it; that is how the truncated, malformed and adversarial cases
are built. The original stays as the reference, and a hand-invented shape is
never the first one.

This project is the argument. The whole provider integration — the client, the
retry policy, the schema validation, the token budget — was built against
fixtures somebody wrote from imagination. They were plausible, they were
consistent, every test passed, and the first real call failed.
