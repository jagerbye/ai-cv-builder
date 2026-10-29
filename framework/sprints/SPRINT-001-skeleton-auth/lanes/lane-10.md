# Lane 10 — wave B

> Lane log. Each task appends: what changed, the lane test command and its
> result, docs touched, decisions needed, `time:` per role.


## T-23 README (B-020) — BLOCKED, no files changed

- blockedOn: decision. The step asks for failing tests, but the only allowed file is README.md. A test file would sit outside the allowlist, and a README has no code path a red test can exercise. The README's claims have to be verified by running commands (the acceptance criteria say so), not by a suite.
- Verified so far, no edits: README says Node 22 (root .nvmrc and engines say 24, ADR-012); README advertises `npm run test:e2e`, which does not exist in root package.json (scripts: typecheck, lint, test, build) or in api/web; the status banner "planned, not yet built" is false.
- Needed to proceed: the owner or Architect says how the acceptance is checked (command transcript as evidence, no test file), and whether a clean-clone run through docker compose is in scope from this lane.

## T-23 README (B-020) — done, README.md rewritten

- Changed: README.md only. Status banner, Node 24, real test commands, no test:e2e, architecture, anti-hallucination mechanism with code references, cuts, AI-use section. Verified claims only; not-built items listed.
- Lane gate: `GATE_LANE_TEST='npm -w api run test -- --run src/routes/health' bash framework/scripts/gate.sh` → lint ok, lane test 4/4 passed, gate ✓ all green.
- Clean clone of committed HEAD (7d1a7f1) in scratchpad: `docker compose up -d --build --wait` healthy (fixed host ports busy on this machine; moved to 15432/13000 and WEB_PORT=15273). `/api/health` → `{"ok":true,"db":true}`; migration applied on boot; web 200.
- Clean clone native: `npm ci`, prisma generate + migrate deploy, lint 0, typecheck 0, build 0, api test 426 passed/5 skipped, web test 99 passed.
- Finding (defect, not fixed here): generation does not run. `createJobWorker` is not started by server.ts or main.ts; a POST /api/cvs job stays `queued` (checked at 3 s and 20 s). README states this.
- Incident: a `gate.sh` run inside the clean clone was done without a DATABASE_URL override, so its root test step may have used the shared dev DB on localhost:5432. Results not inspected. Integrator should check the dev DB for stray rows.
- Docs touched: none (README is the deliverable). Time: developer ~1 h.
