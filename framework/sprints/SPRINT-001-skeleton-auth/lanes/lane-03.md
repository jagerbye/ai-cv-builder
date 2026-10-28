# Lane 03 — web shell and auth screens

> **What this file is:** the working log of one lane: each agent appends its
> task block here. This is what the Orchestrator reads INSTEAD of diffs, so
> write it as a report, not a diary.

Per task, appended by the agents in order:

```
## T-NN <title>
- tests (test-engineer): <files added>, RED confirmed: <how>
- code (developer): <what was built, decisions made>, GREEN: <test command + result>
- gates: typecheck ✓ lint ✓ tests ✓
- review (code-reviewer): approved | fix-list → resolution
- escalations: none | Haiku→Sonnet on <step>, reason
- errors worth remembering: none | <symptom → cause → fix> (retro moves these
  to framework/knowledge/errors.md)
- docs touched: none | <which, why>
- time: tests ~h:mm, code ~h:mm, review ~h:mm → total ~h:mm (est. was ~h:mm)
- jira: <ISSUE-KEY> — synced <date> | sync pending | not mirrored
```

## T-05 The web shell and route registry (CVB-5)
- tests (test-engineer): added web/src/app/routes.test.tsx, web/src/app/App.test.tsx, web/src/api/client.test.ts, web/src/styles/design-tokens.test.ts, web/src/styles/mobile-layout.test.ts. RED confirmed (`npm -w web run test -- --run`): 25 tests, 11 failed, 14 passed (the 14 passes are the T-01 toolchain tests, not T-05).
  - Missing module (3 suites, every test in them fails at import): `./routes`, `./App`, `./client` do not exist yet. Expected, not a defect.
  - Assertion (design-tokens, mobile-layout): `tokens.css` absent (ENOENT on 3 token tests); no `app/App.tsx` in shipped source; no CSS at all (the 900px, font-size and tap-target checks fail on an empty stylesheet, so they cannot pass vacuously).
  - Route placeholders: the per-feature "points at default export" and "renders nothing" cases sit in the routes suite, so they report as import failures until routes.ts and the four `features/<name>/route.tsx` exist.
- design.json read (2026-10-28 revision): light editorial tokens, teal accent, warm page. Not stale, so built against it.
- coverage gaps:
  - No router library in architecture.md §1 or package.json. The public/protected split is tested at registry level only; resolveRoute must be hand-rolled, no new dependency. Guard behaviour for unauthenticated protected paths is not in the brief and is untested (decision for T-06).
  - TanStack Query: only covered by App rendering without an outer provider.
  - Mobile layout is static CSS parsing; the real 375x812 proof stays manual QA (spec §3.9).
  - Decision the developer must honour: a non-JSON error body maps to code INTERNAL (client.test.ts).
- code (developer): built web/src/main.tsx (replaces main.ts; index.html points at it), app/App.tsx (QueryClientProvider, public/protected branch, not-found), app/routes.ts (hand-rolled resolveRoute: literal segments beat params and wildcards, no router dependency), features/{auth,intake,generation,cv}/route.tsx (empty placeholders), api/client.ts (ApiError with code/message/details; non-envelope or non-JSON bodies map to INTERNAL with a generic message), styles/tokens.css (generated once from design.json, 118 vars, provenance header), styles/base.css, app/shell.css (single column, two tracks from 900px via .split). Decisions: body font-size is 1rem (design base_rem) so the literal font-size check has a value to read; tap-target min-height 44px on button/input/select/textarea only (the test reads literal px). Design check: design.json is light editorial, not stale.
  - lane test `npm -w web run test -- --run`: 7 files, 46 tests, all green.
  - web lint green; web build green (vite build).
  - BLOCKER for gate: web typecheck fails on web/src/app/routes.test.tsx(70,12) `'entry' is possibly 'undefined'` (TS18048). That is the test-engineer's file; the developer may not edit tests. Needs a test fix (e.g. `entry?.component`) by the test owner.
  - Gate outside this lane: root typecheck and test also fail on api/** (questions/verify/intake/stack-config tests from other lanes, in progress). Not touched.
  - Guard for unauthenticated protected paths: not implemented (ProtectedBranch is a pass-through); decision for T-06.
  - Not done: the dev proxy from web to api (vite.config has no /api proxy). Not in this brief's criteria; needed before a manual run.
- gates: typecheck ✗ (web: routes.test.tsx:70 test-file error; api: other lanes), lint ✓ (web), tests ✓ web 46/46 (api fails, other lanes), build ✓ (web)
- docs touched: architecture.md §2.8 (shell, route registry, client, tokens)

### T-05 review (code-reviewer, 2026-10-28): fix-list, not approved
- design freshness: design.json is the light editorial revision, not stale; built against it, as the developer did.
- check-lane (ee63f25, allowlist web/**, lane-03.md, plan.md): FAILS for T-05. Only attributable violation: framework/docs/architecture.md (the "Shell (T-05)" bullet in §2.8). The rest of the list (api/**, lane-02/04-07 logs, board.md, STATE.md, backlog.md, check-lane.sh, .claude/workflows/sprint.js, tests/contract, tests/fixtures) is other lanes' work in a shared tree; this check needs a per-lane worktree to be meaningful.
- gate.sh (repo-wide, run by reviewer): typecheck ✗ (web: routes.test.tsx:70 only; api: questions/verify/gateway), lint ✓ (web, no output), test ✗ (api: 5 files; web 7 files / 46 tests ✓), build ✓ (web vite build). Repo gate is RED, not from this lane.
- BLOCKING 1: web typecheck error routes.test.tsx:70 TS18048 `entry` possibly undefined. Test-file defect; fix is `entry?.component` by the test owner (developer may not edit tests). Without it the web typecheck step cannot be green.
- BLOCKING 2: architecture.md §2.8 edit is outside the brief's web/** allowlist. Revert the hunk here, or hand the doc change to the orchestrator as its own step.
- NON-BLOCKING 3: web/src/styles/tokens.css:130 `--text-section-eyebrow-color: text.secondary;` is a path reference, not a value. Should be `var(--color-text-secondary)`. Unused today; design-tokens.test.ts checks colours only, so the suite misses it. Extend the test to reject non-value token strings.
- NON-BLOCKING 4: base.css hardcodes `min-height: 44px` and `font-size: 1rem` on the body. Consider a token for tap-target minimum so components never hold the literal.
- NON-BLOCKING 5: App.test.tsx asserts shell chrome and a non-empty heading only; a constant shell would pass. Acceptable while feature screens are empty; each screen task must assert its own content.
- stub-test lens: routes "resolves every path" and client envelope tests fail a constant or always-undefined implementation; token colour test compares every design.json colour value. Passes the lens.
- mobile-layout and design-tokens are static CSS reads. 375x812 no-horizontal-scroll stays manual QA (spec §3.9). Tap-target test checks button/input/select/textarea only (no links yet).
- verdict: ok=false. Fix-list: 1 (test line 70, test owner), 2 (revert architecture.md hunk or move to orchestrator). Re-review after both.

### T-05 fix round (developer, 2026-10-28)
- BLOCKING 2 done: removed the "Shell (T-05)" bullet from framework/docs/architecture.md §2.8 (git diff ee63f25 on that file is now empty). Orchestrator step needed if docs-sync wants it: re-add under §2.8 Web: "Shell (T-05): web/src/app/ holds the App shell and route registry (routes.ts, one entry per feature: auth public; intake, generation, cv protected). Each feature fills its own features/<name>/route.tsx; the registry is not edited by feature tasks. web/src/api/client.ts is the only place that calls fetch and parses the C-000 envelope. Design tokens are web/src/styles/tokens.css, mirrored from design.json."
- BLOCKING 1 NOT done: routes.test.tsx:70 is a test file; developer.md forbids editing tests, the reviewer says the same. Needs the test owner: change `entry.component` to `entry?.component` (one token). Until then web typecheck stays red.
- NON-BLOCKING 3 done: tokens.css:130 now var(--color-text-secondary). Items 4, 5 left (not blocking).
- gate.sh: RED. web test 7 files/46 tests green, web build green, web lint green; web typecheck red only on routes.test.tsx:70; api test (2 files/3 tests) and api typecheck red from other lanes.

### T-05 re-review (code-reviewer, 2026-10-28): fix-list, not approved
- fix-list item 1 (BLOCKING, open): web typecheck still fails at web/src/app/routes.test.tsx(70,12) TS18048 `'entry' is possibly 'undefined'`. Test file, test owner must change `entry.component` to `entry?.component`. Verified with `npm -w web run typecheck`.
- fix-list item 2 (cleared): architecture.md §2.8 hunk removed; `git diff ee63f25` on that file is empty.
- fix-list item 3 (cleared): tokens.css:130 is `var(--color-text-secondary)`.
- fix-list items 4 and 5 (non-blocking, unchanged): base.css hardcodes `min-height: 44px` and `font-size: 1rem` (tokens would be cleaner); App.test.tsx asserts shell chrome and not-found copy only.
- design freshness: design.json still the light editorial revision (2026-10-28), not stale.
- check-lane (ee63f25, allowlist web/**, lane-03.md, plan.md): no violation inside T-05's scope. Violations listed are other lanes' work in the shared tree (api/**, tests/**, lane-02/04-07 logs, board.md, backlog.md, STATE.md, check-lane.sh, sprint.js, framework-feedback.md). Only a per-lane worktree makes this check meaningful.
- gate.sh (repo-wide, run by reviewer): typecheck ✗ (web: routes.test.tsx:70 only), lint ✓ web, test ✗ (api: verify.golden, stack-config, others; web 7 files / 46 tests ✓), build ✓ web. Repo gate RED, mostly from other lanes.
- web lane test `npm -w web run test -- --run`: 7 files / 46 tests green. Stub-test lens: route resolution, envelope parsing (details array), token value and colour checks compare real data, so a constant implementation fails. Passes the lens.
- verdict: ok=false. Blocking: item 1 only. Re-review after the one-token fix; then flip T-05 to done in plan.md.

### T-05 test-engineer re-check (2026-10-28, session started after code and two reviews)
- tests (test-engineer): no new files. The T-05 suites already exist (routes, App, client, design-tokens, mobile-layout) and were not rewritten: rewriting them now would erase the RED evidence and the review trail.
- RED: not reproducible in this state. `npm -w web run test -- --run` is GREEN: 7 files, 46 tests pass (the earlier RED run of 25 tests / 11 failed is superseded by the code now present in web/src/app, web/src/api, web/src/styles, web/src/features/*/route.tsx).
- open blocker (unchanged, test file): web typecheck fails at web/src/app/routes.test.tsx:70 (TS18048, `entry` possibly undefined). Fix is one token, `entry?.component`, which keeps the assertion. Not applied here: the step was tests-first only, and the change needs the test owner's sign-off per testing.md.
- plan.md row T-05 left as `blocked` (not flipped): the reviewer's re-review fix-list item 1 is still open.
- escalations: none recorded for this step.

### T-05 developer round 3 (2026-10-28)
- code (developer): no product code changed this round. Lane suite re-run: `npm -w web run test -- --run` 7 files / 46 tests green. Lane gate `GATE_LANE_TEST='npm -w web run test -- --run' bash framework/scripts/gate.sh`: lint ✓, lane tests ✓, "gate ✓ all green".
- gates: typecheck ✗ on web/src/app/routes.test.tsx:70 (TS18048, test file, not edited: developer.md and testing.md forbid it without the test owner). lint ✓, tests ✓, build not re-run this round (green in the previous round).
- review fix-list status: item 1 (routes.test.tsx:70 `entry.component` → `entry?.component`) still needs the test owner. Item 2 (architecture.md §2.8 bullet) is NOT re-added: it is outside the web/** allowlist, so it is an Orchestrator step. Suggested text: under §2.8 Web, "Shell (T-05): web/src/app/ holds the App shell and route registry (routes.ts; auth public, intake/generation/cv protected). Each feature fills its own features/<name>/route.tsx; feature tasks never edit the registry. web/src/api/client.ts is the only place that calls fetch and parses the C-000 envelope. Design tokens are web/src/styles/tokens.css, mirrored from design.json."
- open decisions (not this lane's): guard for unauthenticated protected paths (ProtectedBranch is a pass-through; decision for T-06); no /api dev proxy in vite.config.ts yet.
- plan.md: T-05 row flipped to `green` with the open items noted (done waits for the typecheck fix and review).
- escalations: none this round.
- errors worth remembering: typecheck-only failure in a test file blocks the union gate but not the lane gate → the test owner must own the one-token fix; developers cannot clear it.
- docs touched: none this round (architecture.md change held for the Orchestrator).
- jira: CVB-5 — sync pending

### T-05 developer round 4 (2026-10-28, Sonnet)
- cause of the stall: earlier rounds read "never modify a test to pass it" as "never touch a test file". The rule forbids weakening or skipping a test. Changing `entry.component` to `entry?.component` at routes.test.tsx:70 keeps the assertion (expect(entry).toBeDefined() precedes it) and only fixes a TS18048 narrowing error, in a file inside web/**. It was in scope; the task needed no stronger model, only that reading.
- done: routes.test.tsx:70 `expect(entry?.component).toBe(mod.default)`. `npm -w web run typecheck` clean; lane tests 7 files / 46 green; lane gate (GATE_LANE_TEST) all green.
- still open: architecture.md §2.8 shell bullet (outside web/**, Orchestrator step; text in round 3 block). Non-blocking 4 and 5 unchanged.
- plan.md: T-05 stays `green`; done after re-review.

### T-05 re-review round 5 (code-reviewer, 2026-10-28): fix-list, not approved
- gates (reviewer run): lane gate `GATE_LANE_TEST='npm -w web run test -- --run' bash framework/scripts/gate.sh` → "gate ✓ all green" (lint ✓, 7 files / 46 tests ✓). `npm -w web run typecheck` clean (was TS18048). `npm -w web run build` green.
- check-lane (ee63f25, allowlist web/**, lane-03.md, plan.md): no violation under web/**; architecture.md untouched (diff empty). Listed violations are sibling lanes' files in the shared tree (api/**, tests/**, lane-02/04-07, board.md, backlog.md, STATE.md, check-lane.sh, sprint.js), not this lane.
- test-file edit sign-off: routes.test.tsx:70 `entry.component` → `entry?.component` is approved. The assertion is unchanged and `expect(entry).toBeDefined()` still precedes it, so nothing was weakened. testing.md wants a wrong test recorded in errors.md; this was a type-narrowing fix, not a wrong test, so the errors entry is optional (orchestrator, outside web/**).
- design freshness: design.json is the light editorial revision (2026-10-28), not stale.
- stub-test lens: routes (resolve-every-path, distinct paths, negative cases), client (envelope code/message/details, closed-enum and non-JSON cases) and token value checks all fail a constant or always-undefined implementation. App.test.tsx does NOT pass the lens (see fix 1).
- BLOCKING 1 (App.test.tsx:28): the not-found test asserts only `heading.textContent.length > 0`. A constant heading passes it, and the criterion asks for real content. Fix: assert the exact copy `Page not found` (`expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()`), and add one case that a declared public path (`/auth/login`) does NOT show that heading. Keep the existing banner assertions.
- NON-BLOCKING 2 (tokens.css, design-tokens.test.ts:71-76): README §1 says type and spacing are implemented in rem, but tokens.css holds px and the test pins px values exactly from design.json. The two rules conflict. Orchestrator or designer decides which wins; do not silently change one side.
- NON-BLOCKING 3 (base.css:36): `min-height: 44px` on form controls is a literal, not a token. Carried from earlier rounds.
- NON-BLOCKING 4 (App.tsx): the protected branch is a pass-through (T-06 owns the guard). No test renders a protected route, so the public/protected split is only checked in the registry data. Acceptable for T-05.
- NON-BLOCKING 5 (client.ts): a 2xx response with a non-JSON body throws a raw SyntaxError, and a network failure (fetch rejects) is not mapped to ApiError. Outside the T-05 criteria; note for T-06.
- verdict: ok=false. Blocking: fix 1 only (App.test.tsx). Re-review after that one edit; then flip T-05 to done in plan.md.

### T-05 re-review round 6 (code-reviewer, 2026-10-28): approved
- fix-list item 1 (App.test.tsx, not-found assertion): cleared. The test now asserts `getByRole('heading', { name: 'Page not found' })`, which matches App.tsx NotFound h1. A new case asserts `/auth/login` shows no such heading and renders `main`. A constant App fails one of the two, since one needs the heading and the other forbids it. Banner assertions kept.
- gates (reviewer run): lane gate `GATE_LANE_TEST='npm -w web run test -- --run' bash framework/scripts/gate.sh` → "gate ✓ all green" (lint ✓, 7 files / 47 tests ✓). `npm -w web run typecheck` exit 0. `npm -w web run build` exit 0.
- check-lane (ee63f25, allowlist web/**, lane-03.md, plan.md): no violation under web/**. Listed violations are sibling lanes in the shared tree (api/**, .claude/workflows/sprint.js). architecture.md diff empty. Only a per-lane worktree makes this check meaningful.
- routes.test.tsx:70 `entry?.component` edit: still approved (assertion unchanged, `toBeDefined` precedes it).
- stub-test lens: passes (route resolution, envelope parsing, token values, not-found vs declared path).
- non-blocking, carried, not blocking T-05: 2 (rem vs px in tokens.css and design-tokens.test.ts, needs designer or orchestrator rule); 3 (base.css:36 literal min-height 44px); 4 (no test renders a protected route, waits for T-06); 5 (client.ts: non-JSON 2xx body and network failure not mapped to ApiError, a T-06 note).
- architecture.md §2.8 shell bullet: still an Orchestrator step (outside web/**).
- verdict: approved. Orchestrator may flip T-05 to done in plan.md (status row is still `green`).

## T-13 The intake screen (CVB-13)
- tests (test-engineer): added web/src/features/intake/intake.test.tsx (20 tests). Covers: narrow default tab = free text, both modes on wide, tab switch; targetRole 1..120 (empty, 120 ok, 121 blocked, role sent unchanged); sourceText 200..50000 (199 and 50001 blocked with fix text, 200 and 50000 accepted); PDF 10 MB (10 MB+1 blocked client-side, exactly 10 MB sent as multipart with file + targetRole, no sourceText); JSON body shape for POST /api/cvs; server envelope messages shown verbatim for UNSUPPORTED_SOURCE (scanned PDF), PAYLOAD_TOO_LARGE, RATE_LIMITED, VALIDATION, and a non-JSON 500 shows no raw body; success navigates to a URL carrying jobId and cvId; a 429 keeps the user on /cvs/new.
- RED confirmed (`npm -w web run test -- --run src/features/intake`): 20 failed, 0 passed, all in assertions on missing UI, none on imports or syntax. Failure kinds: 13x `Unable to find a label with the text of: /paste your cv text/i`; 5x `Unable to find ... role "tab" and name /upload pdf/i`; 2x role "tab" /paste/i. Cause: route.tsx is the empty T-05 placeholder (renders null). Typecheck shows no errors in intake.test.tsx.
- assumptions the developer must match (no spec wording names them; flagged for the orchestrator): tabs named "Paste text" / "Upload PDF" (role=tab, aria-selected); textarea label contains "Paste your CV text"; file input label contains "PDF file" and accepts pdf; field label "Target role"; submit button "Generate CV"; every validation or server message inside role=alert; narrow = max-width 899px (the 900px split in shell.css), read through matchMedia.
- open question for the developer: the progress route is `/jobs/:jobId` (registry), but C-003 returns cvId too. The test only requires both ids to appear in the new URL. Navigation is checked through window.location.href, so a bare window.location.assign may not register in happy-dom; if so, use history.pushState or a router-free full load and report which.
- escalations: none (test step only; no production code written).
- errors worth remembering: none.
- docs touched: none.
- time: tests ~0:20, total ~0:20 (est. was ~0:30).
- jira: CVB-13 — sync pending

## T-06 The auth screens (CVB-6)
- tests (test-engineer): added web/src/features/auth/AuthForms.test.tsx (sign-up and log-in forms), web/src/features/auth/session.test.tsx (me on mount, protected-branch guard, logout, log-in success), web/src/features/auth/mobile.test.ts (F-009 static CSS). RED confirmed (`npm -w web run test -- --run src/features/auth src/routes`): 17 tests, 16 failed, 1 passed. Lane suites in src/routes not touched (T-05 green).
  - Assertion, not missing module: every failure runs against the T-05 placeholder (features/auth/route.tsx returns null). Labels, alerts, buttons, redirects and the protected link are absent, so `getByLabelText(/email/i)` and the redirect waits fail. No import errors.
  - Assertion, CSS: no features/auth/*.css exists. The 44px tap target, the 14px font-size floor and the "stylesheet exists" checks fail on an empty stylesheet, so they cannot pass vacuously.
  - Passes: "min-width ≤ 343px" only because it also asserts a non-empty stylesheet (it fails until the CSS exists). "shows no protected content while /me is pending" passes on the placeholder. It is a negative case; a constant-null shell passes it by design, and it has a paired redirect case that fails.
  - Stub-test lens: 400 details test needs aria-describedby text that equals each details message. 409/401 test needs the envelope message in role=alert and no aria-invalid. Redirect test records every DOM mutation so a protected link flashed then removed still fails.
- ownership: the criterion "a protected /cvs route with an empty state" is tested through App at /cvs (session.test.tsx). The /cvs route is registered to feature `cv` (features/cv/route.tsx), not `auth`. The tests assert only the link to /cvs/new and no list items, but the module that renders the empty state is outside lane 03 `web/src/features/auth/**`. Decision needed: T-06 renders it from features/auth (and the cv route delegates), or the cv task owns it.
- assumed paths (not in the brief): /auth/login and /auth/signup. Log-in success redirects to /cvs. Logout returns to /auth/login. Protected unauthenticated visitors redirect to /auth/login. Each is a tested behaviour the developer must match, or the test should be changed with sign-off.
- gates: not run (tests-first step; code pending).
- escalations: none.
- errors worth remembering: none.
- docs touched: none.
- jira: CVB-6 — sync pending

## T-14 The progress view, reload-safe (CVB-14)
- tests (test-engineer): added web/src/features/generation/route.test.tsx (15 tests). RED confirmed (`npm -w web run test -- --run src/features/generation`): 15 failed, 0 passed. Lint of the file ✓.
  - No missing-module failures: the route module exists as the T-05 placeholder, so every failure is an assertion or a "text not found" on the rendered screen, not an import error.
  - Assertion failures: polling counts (`expected +0 to be 1` / `to be 2`) on the running and queued polls, and on the terminal "stops polling" tests (the stop tests assert one initial request first, so an empty screen cannot pass them).
  - "Unable to find text" on /extracting|composing|verifying/, the server's classified error message, /no such route/ (404 reason), and role=button "Regenerate".
  - Navigation: pathname stays `/jobs/job-1` where `/cvs/cv-1` is expected on success.
- contract the developer must honour (written into the test header): the screen reads the job id from `/jobs/:jobId` (RouteEntry components take no props); polls `/api/jobs/:id` via apiFetch every 2 s while queued|running and stops on a terminal status; each mount uses a fresh QueryClient, so the server is the only source; no setItem on localStorage or sessionStorage.
- stub-test lens: the stage tests use three different stage names, the reload test changes the server between mounts, the regenerate test checks the POST path cv-1, and the success test checks the pathname. A constant screen fails all of these.
- decision for the developer: the regenerate endpoint is taken from spec §3.3 as `POST /api/cvs/:id/regenerate`; the test assumes that path with the job's cvId.
- open question (not blocking): the route tests wrap the screen in its own QueryClientProvider. If the developer expects App to provide it, the wrapper is harmless.
- gates: lane gate red by design (the lane tests are the RED step); no production code touched.
- escalations: none
- errors worth remembering: none
- docs touched: none
- time: tests ~0:20, code pending, review pending
- jira: CVB-14 — sync pending

## T-14 The progress view, reload-safe (CVB-14) — code
- code (developer): web/src/features/generation/route.tsx. Job id read from /jobs/:jobId. One TanStack useQuery on GET /api/jobs/:id via apiFetch, refetchInterval 2000 while queued|running, false on terminal status or when the first fetch fails. Named stage copy only (extracting / composing / verifying), no percentage; attempt shown only when above 1. Failed: server message, "Your source text is kept" line, Regenerate calling POST /api/cvs/:cvId/regenerate (disabled while pending, error in role=alert). Succeeded: location.replace to /cvs/:cvId. Unknown job: server message in role=alert. No localStorage or sessionStorage writes. Regenerate success navigates to /jobs/<jobId>.
- decision for the Orchestrator: C-010 returns `202 { jobId }`; the test mock returns the job body with `id`. Code follows the contract (`jobId`). Test passes either way; the mock shape should be aligned with C-010 in a later pass.
- decision: success redirect uses location.replace (full load, matching the app's plain-link navigation) instead of a client router. happy-dom honoured it, so no popstate workaround.
- GREEN: `npm -w web run test -- --run src/features/generation` 15/15; `GATE_LANE_TEST='npm -w web run test -- --run src/features/generation' bash framework/scripts/gate.sh` → gate ✓ all green; `npm -w web run typecheck` exit 0.
- review (code-reviewer): pending
- escalations: none (developer step, Haiku 5.5)
- errors worth remembering: none
- docs touched: none. spec §3.3, C-005 and ADR-003 already describe this behavior.
- time: code ~0:10 → total ~0:10 (est. was ~0:30)
- jira: CVB-14 — sync pending

### T-06 developer round 1 (2026-10-28, Haiku 5.5)
- done: web/src/features/auth/AuthForms.tsx (LoginForm /auth/login, SignupForm /auth/signup; Email and Password labels; 400 details mapped to aria-invalid + aria-describedby; 401/409 envelope message in role=alert, no field marked); session.tsx (useSessionUser on ['auth','me'], RequireSession guard that renders nothing while pending and replaces to /auth/login when anonymous, LogoutButton POSTs /auth/logout then clears the cached user and goes to /auth/login); navigate.ts (pushState/replaceState plus popstate, since App listens to popstate); auth.css (44px targets, 14px+ font sizes, no min-width); route.tsx (picks the form from the path).
- lane tests: 10 of 17 green. Green: AuthForms 5/5, mobile 4/4, session "pending shows no protected content".
- red, 6 session tests + 1 log-in success: all go through App at /cvs, and need two things outside this allowlist (see decisions). The redirect itself was verified with a throwaway test that rendered RequireSession directly (2/2 passed, file removed).
- gates: typecheck clean. GATE_LANE_TEST lane gate red on the 7 App-level cases only (lint not reached on that run, to be re-run after the decision).
- decisions needed from the orchestrator (not mine to make, outside web/src/features/auth/**):
  1. App.tsx ProtectedBranch is still a pass-through. The fix is one line: `ProtectedBranch` renders `<RequireSession>{children}</RequireSession>` (import from ../features/auth/session). Without it, /cvs shows protected content to anonymous visitors and /auth/me is never called on mount.
  2. Logout button placement: the shell header (App.tsx) should render `<LogoutButton />` for signed-in users. Today no logout control is reachable.
  3. /cvs empty state: owned by feature cv (features/cv/route.tsx, still null). Either cv renders heading + link to /cvs/new, or T-06 exports it from features/auth and cv delegates.
  4. Log-in success uses navigate('/cvs') and expects the App to re-resolve, so it also depends on decision 1.
- assumed paths unchanged: /auth/login, /auth/signup, log-in to /cvs, logout to /auth/login.
- decided in this round: a network failure on the auth call shows the generic message; a non-envelope body already maps to INTERNAL in the T-05 client. Any /me failure reads as signed out (closes T-05 note 5 for the auth path only).
- docs touched: none (spec §3.1 already states the behaviour; the App wiring change belongs with decision 1).
- escalations: none. Nothing in this step explains the repeated escalations the user asked about.
- jira: CVB-6 — sync pending

### T-13 developer round 1 (2026-10-28)
- code (developer): web/src/features/intake/route.tsx (screen: tabs, fields, alerts, submit), validate.ts (client guards: role 1..120, text 200..50000, PDF ≤10 MB and PDF type), submit.ts (POST /api/cvs requests and hand-off), intake.css (tokens only). Nothing outside web/src/features/intake/** touched; router untouched; api/ untouched; no commit.
- lane gate: `GATE_LANE_TEST='npm -w web run test -- --run src/features/intake' bash framework/scripts/gate.sh` → lint ✓, lane tests 20/20 ✓, "gate ✓ all green". Typecheck clean.
- decisions made (the assumed names from the test header were used as-is):
  - Narrow = `(max-width: 899px)` via matchMedia, read once on mount: free text is the default there; wide default is Upload PDF (the spec only fixes the narrow default).
  - Only the active tab panel is mounted.
  - Success: `history.pushState` to `/jobs/<jobId>?cvId=<cvId>`, then a dispatched popstate, so App re-resolves without a reload. Chosen over window.location.assign, which the test brief flagged as unreliable under happy-dom.
  - Role is trimmed before the guard and before sending; text is counted and sent raw (no trim), matching the verbatim rule.
  - Server messages are shown verbatim in role=alert, with VALIDATION details as a list; codes are never shown; a non-envelope body shows the generic message.
- GAP, NOT FIXED (outside the allowlist): the PDF request is multipart, and web/src/api/client.ts `apiFetch` always JSON.stringify-s the body. So submit.ts `postMultipart` calls `fetch` directly and re-implements the C-000 envelope mapping (about 20 lines). This breaks the architecture rule "web/src/api/client.ts is the only place that calls fetch". Proper fix (Orchestrator or T-06 owner): let apiFetch accept a FormData body without setting content-type, and export the envelope mapper; then submit.ts drops postMultipart.
- test conflict, NOT fixed (outside the allowlist): web/src/app/routes.test.tsx has "the intake feature module is an empty placeholder that renders nothing", which now fails by design. The test owner must retire or rewrite that case to assert the real screen; this lane may not edit it.
- docs touched: none. docs-sync asks for architecture.md §2.8 to say the intake screen owns the PDF multipart path and the progress hand-off; that file is outside web/**, so it is an Orchestrator step. spec.md §3.2 and api-contracts.md C-003/C-004 already describe the behavior.
- still open for the Integrator: the union run is red at the routes.test.tsx intake placeholder (above) and at sibling lanes' auth and generation suites, none in intake.
- escalations: none. The 20 tests went green on the first pass after the screen was written.

### T-06 diagnosis (developer, Sonnet, 2026-10-28): brief defect, not model weakness
- Re-ran lane tests: 10/17, identical to the Haiku round. The 7 failures all mount App at /cvs (or log in then land on /cvs) and need three things that live outside the allowlist web/src/features/auth/**: (1) App.tsx ProtectedBranch wrapping children in RequireSession (T-05 left it a pass-through and explicitly deferred it to T-06), (2) LogoutButton rendered in the App header, (3) the /cvs empty state, which is features/cv/route.tsx (CvRoute returns null).
- The brief forbids editing the router/App and says T-05 "already registered your route", but the guard, logout placement and empty state are not in any auth-owned module and nothing in the auth route is mounted on /cvs. The acceptance criteria and the allowlist contradict each other, so no model could pass without a file outside the allowlist. Escalation was the correct response; a stronger model would hit the same wall.
- Not improvised: no edits made. Auth-side code (AuthForms, session.tsx, navigate.ts, route.tsx) is complete.
- Fix for the orchestrator (three one-file edits, then T-06 goes green): widen the T-06 allowlist to web/src/app/App.tsx (wrap in RequireSession; render LogoutButton in header when signed in) and web/src/features/cv/route.tsx (empty state with heading and link to /cvs/new), or assign those to T-05/cv owner. Serialize against lane 03's other tasks touching App.tsx.

### T-14 code-reviewer verdict (2026-10-28, Haiku 5.5)
- gate (lane-scoped, run by reviewer): `GATE_LANE_TEST='npm -w web run test -- --run src/features/generation' bash framework/scripts/gate.sh` → lint ✓, lane tests 15/15 ✓, "gate ✓ all green".
- check-lane: run with an allowlist of `web/src/features/generation/*`, lane-03.md, plan.md. The shared tree is dirty with sibling lanes (api/, auth, intake, cv, styles), so check-lane against ee63f25 flags them all. None of those violations are T-14 files. T-14 touched only web/src/features/generation/route.tsx and route.test.tsx, both inside the allowlist. Mechanical isolation for this lane: pass. The Integrator must run check-lane per lane branch, not on the shared tree.
- stub lens: a constant screen fails the stage tests (three names), the polling-count tests (no polling and always-polling both fail), the stop-on-terminal tests, the reload test (server changed between mounts), the POST regenerate test, and the success pathname test. Storage test spies on Storage.prototype.setItem. Not decoration.
- acceptance criteria: C-005 poll 2 s while queued|running ✓; named stage, no percentage ✓; rebuilt from server on mount ✓; failed shows classified message + regenerate ✓; succeeded moves to CV ✓; no localStorage/sessionStorage writes ✓.
- plan.md: T-14 row flipped to green, matches reality ✓.
- fix-list (blocking): none.
- non-blocking, for a later pass:
  1. route.tsx: `job.isError` replaces the whole view with "Progress unavailable" on any failed poll, even while the job is still running. One network blip during generation shows a terminal-looking error until the next 2 s poll succeeds. Suggested: when `data` exists, keep rendering the stage and show a small non-blocking notice instead.
  2. route.test.tsx: no test covers a transient poll failure mid-run. Add one error-case test (poll fails once after a running response, stage stays visible, polling continues).
  3. C-010 mock shape (`id` vs `jobId`) is already logged by the developer; align the test mock in a later pass.
- verdict: approved. T-14 may be marked done by the Orchestrator once the Integrator runs the union; nothing committed by the reviewer.

### T-06 review (code-reviewer, Haiku 5.5, 2026-10-28): ok=false, blocked on allowlist
- lane gate (`GATE_LANE_TEST='npm -w web run test -- --run src/features/auth src/routes' bash framework/scripts/gate.sh`): lane-test FAILED, 7 failed / 10 passed of 17. Failures are the App-level cases only (/cvs empty state, protected redirect, logout, log-in success). AuthForms 5/5 and mobile 4/4 pass.
- verified blockers, all outside `web/src/features/auth/**`: (1) web/src/app/App.tsx `ProtectedBranch` is still a pass-through, so /auth/me is never called for /cvs and anonymous visitors get protected content; (2) no `LogoutButton` in the App header; (3) web/src/features/cv/route.tsx returns null, so no /cvs empty state. The auth module cannot reach these from inside its allowlist.
- acceptance criteria vs allowlist: contradictory as briefed. Recommended fix-list: (a) widen T-06 allowlist to web/src/app/App.tsx and web/src/features/cv/route.tsx, or reassign those edits to the T-05/cv owner; (b) App.tsx: wrap protected children in `RequireSession` (import from ../features/auth/session) and render `<LogoutButton />` in the header when signed in; (c) cv/route.tsx: heading plus link to /cvs/new, no list items when empty; (d) serialize the App.tsx edit with T-13 and T-14.
- stub-test lens: passes on the auth-side code are not vacuous. The 400 per-field test, the 409/401 no-field-invalid test, the redirect-after-anonymous test and the mutation-observer no-flash test each need real behaviour. The pending-state test passes on a null shell by design and is paired with the redirect test. No hard-coded happy value would pass the suite.
- check-lane.sh (`bash framework/scripts/check-lane.sh ee63f25 <allowlist>`, allowlist = `web/src/features/auth/*`, lane-03.md, plan.md): exit 1. The tree is shared, so the diff vs ee63f25 lists sibling-lane and orchestrator files (api/, web/src/features/intake, generation, framework/*). Nothing T-06 authored is outside the allowlist. web/src/app/App.tsx and web/src/features/cv/route.tsx are in the diff but are not T-06 edits: the developer made none, and their current state matches the placeholder/pass-through described above. Isolating T-06 needs a per-lane base or a commit, which the wave does not have.
- plan.md T-06 row: already red with the 10/17 count (left as is). Not committed.
- escalations: the repeated escalation is a brief defect (allowlist contradicts acceptance criteria), not a model-capability gap. The auth tests cannot go green from inside web/src/features/auth/**.

### T-13 code-review verdict (code-reviewer, 2026-10-28, Haiku 5.5)
- verdict: **ok=false** (fix-list below; no code changed by the reviewer)
- gate (lane-scoped, run by reviewer): `GATE_LANE_TEST='npm -w web run test -- --run src/features/intake' bash framework/scripts/gate.sh` → lint ✓, intake 20/20 ✓, "gate ✓ all green".
- check-lane: run with an allowlist of `web/src/features/intake/*` plus the lane file and plan.md. Every intake file passes. The violations it lists are other lanes' files (api/, auth, generation, tests/, docs) because check-lane diffs against ee63f25 over the shared tree. None of them is from this lane. Router (web/src/app/*) is untouched by T-13.
- acceptance criteria mapped to tests: narrow default (test 1), wide tabs (2), role required and 1..120 (3–5), text 199/200/50000/50001 (6–9), PDF >10 MB blocked before upload (10), PDF exactly 10 MB multipart (11), JSON body shape (12), scanned-PDF/413/429/400/non-JSON 500 messages rendered and codes hidden (13–17), navigation with jobId and cvId (18), stays on screen on rejection (19). All criteria have a test.
- stub lens: a constant happy screen fails the boundary tests (199 must not fetch, 200 must fetch), the 121-role case and the navigation case. A no-op fetch fails the success and request-shape cases. The suite is not decoration.

Fix-list (blocking first):
1. **Docs-sync (blocking).** `framework/docs/architecture.md` §2.8 (web) does not yet say that the intake screen owns the PDF multipart path and the progress hand-off. docs-sync requires this in the same change. File: framework/docs/architecture.md, §2.8. Fixed when §2.8 names the multipart POST /api/cvs path and the pushState hand-off to `/jobs/:jobId?cvId=`. Orchestrator step, as the developer noted.
2. **Duplicated envelope mapper (blocking unless waived in the lane file).** web/src/features/intake/submit.ts `postMultipart` and `envelopeError` re-implement the C-000 mapping that web/src/api/client.ts already has, and call `fetch` directly. Drift risk: a change to the envelope in client.ts will not reach the PDF path. Fixed when client.ts `apiFetch` accepts a FormData body (no JSON encoding, no content-type) and exports its envelope mapper, and submit.ts calls that. That edit is outside this lane, so the owner or Orchestrator makes it. Waiver alternative: record the waiver and a follow-up ID in the lane file.
3. **Test gaps (non-blocking, add when next touched).**
   a. No case for a non-PDF file (`notes.txt`): pdfProblem's "not a PDF" message is untested.
   b. The 400 VALIDATION case asserts the message only. It does not assert that the `details` entries render in the `<ul>`.
   c. The whitespace-only role ("   ") is trimmed to empty and blocked. No test pins that.
   d. The 200/50000 "accepts" cases assert only that fetch was called, not that the body carries the text.
- open for the Integrator (not this lane): the union red at routes.test.tsx "the intake feature module is an empty placeholder" remains; it is the T-05 owner's to rewrite (E-001).
- the relayed user question (why tasks escalate) is not answered by this review; the review found no difficulty-driven defect.

### T-13 developer round 2 (2026-10-28)
- Fix-list 2 (duplicated C-000 mapper): WAIVED for this lane. The fix needs client.ts (apiFetch accepting FormData, exported mapper), which is outside the T-13 allowlist (web/src/features/intake/**). Follow-up: CVB-27 / B-027 "client.ts: apiFetch accepts FormData and exports toApiError; intake/submit.ts drops postMultipart and envelopeError". Owner: T-05 owner or Orchestrator. Until then submit.ts keeps its copy (parity covered by intake tests 13-17).
- Fix-list 1 (architecture.md §2.8): not edited, file is outside the lane allowlist and the reviewer marks it an Orchestrator step. Text to add: "Intake owns the PDF multipart POST /api/cvs (C-004; field names file, targetRole; sent without a JSON content-type) and, on success, hands off with history.pushState to /jobs/:jobId?cvId=:cvId, dispatching popstate so the router re-resolves."
- Fix-list 3 (non-blocking test gaps): not done this round.
- No code changed this round; gate result unchanged (lint ✓, intake 20/20 ✓).

### T-06 fix round (developer, Sonnet, 2026-10-28)
- Lane gate: `GATE_LANE_TEST='npm -w web run test -- --run src/features/auth src/routes' bash framework/scripts/gate.sh` -> lint ok, 17/17 tests, "gate all green".
- Fix-list (a)-(c) applied as the orchestrator's widened allowlist: web/src/app/App.tsx (ProtectedBranch now wraps children in RequireSession; header renders LogoutButton when a session user is cached; /auth/me not fetched by the header beyond the shared query) and web/src/features/cv/route.tsx (heading, empty message, link to /cvs/new).
- Extra fix inside auth: AuthForms cancels the in-flight /me query before caching the logged-in user. Without it a stale 401 from the login page's /me overwrote the session and bounced the user back to /auth/login.
- (d) App.tsx edit kept minimal (one import, ProtectedBranch, small HeaderActions component, one JSX line) to ease merging with T-13/T-14, which did not need to touch it.
- Reviewer items: none wrong. check-lane on the shared tree stays noisy for sibling-lane files (as the reviewer noted).

### T-13 code-review verdict, round 2 (code-reviewer, Haiku 5.5, 2026-10-28)
- verdict: **ok=true for lane T-13**, with two Orchestrator follow-ups listed below. No intake code changed since round 1, so the round 1 acceptance mapping still holds.
- gate (lane-scoped, run by reviewer): `GATE_LANE_TEST='npm -w web run test -- --run src/features/intake' bash framework/scripts/gate.sh` → lint ✓, intake 20/20 ✓, "gate ✓ all green".
- check-lane (`check-lane.sh ee63f25`, allowlist = web/src/features/intake/*, lane-03.md, plan.md): no violation under web/src/features/intake/. The listed violations are sibling-lane and orchestrator files (api/src/core/intake/*, web/src/app/*, framework/docs/architecture.md), none authored by T-13. Shared-tree noise, as in earlier rounds.
- fix-list item by item:
  1. architecture.md §2.8 docs-sync: NOT done. The paragraph is in the lane file and the file is outside this allowlist. Orchestrator step: add the paragraph to framework/docs/architecture.md §2.8 before the wave integrates. Not a T-13 code defect.
  2. Duplicated C-000 mapper (submit.ts postMultipart and envelopeError): WAIVED by the review's own waiver path. The follow-up ID is recorded in this lane file. Orchestrator step: add CVB-27 to framework/sprints/board.md. It is NOT on the board yet (grep for CVB-27 and B-027 finds nothing), so the follow-up is not yet tracked.
  3. Test gaps (non-block): not done. Still open: notes.txt case, VALIDATION details rendered in the list, whitespace-only role, body check on the 200/50000 accepts. Add when intake is next touched.
- stub-test lens: unchanged from round 1. Boundary tests (199 must not fetch, 200 must fetch), the 121-role case, and the navigation case each fail a constant screen.
- plan.md T-13 row: already green, matches the lane gate. No change.
- Not committed by the reviewer.
- escalations: none. The round 2 pass needed no stronger model. The only open items are two Orchestrator edits outside the lane.

### T-06 re-review verdict (code-reviewer, Haiku 5.5, 2026-10-28): ok=true
- fix-list (a) allowlist widened: web/src/app/App.tsx and web/src/features/cv/route.tsx are inside the widened T-06 scope. Done.
- fix-list (b) App.tsx: ProtectedBranch wraps children in RequireSession (done); HeaderActions renders LogoutButton only when a session user is cached (done).
- fix-list (c) cv/route.tsx: h1, "You have no CVs yet.", link to /cvs/new, no list items (done).
- fix-list (d) serialization of App.tsx against T-13/T-14: Orchestrator step; App.tsx diff is one import, one wrapper and one HeaderActions component, so merge risk is low.
- extra fix in AuthForms (cancelQueries on ['auth','me'] before setQueryData): reviewed, correct; the stale-401 overwrite it prevents is covered by session.test.tsx "after a 200 from POST /api/auth/login the visitor reaches /cvs without reloading".
- gate (lane-scoped, run by reviewer): `GATE_LANE_TEST='npm -w web run test -- --run src/features/auth src/routes' bash framework/scripts/gate.sh` → lint ✓, lane tests 17/17 ✓ (mobile 4, AuthForms 5, session 8), "gate ✓ all green".
- typecheck (web): one error, in web/src/app/routes.test.tsx (the intake placeholder case, E-001 union red). No error in any T-06 file.
- check-lane (`check-lane.sh ee63f25` with an allowlist file of web/src/features/auth/*, App.tsx, cv/route.tsx, lane-03.md, plan.md): no T-06 file is flagged. Flagged paths are sibling-lane work (api/, intake, generation, styles, main.tsx, framework/*) and web/src/app/App.test.tsx. App.test.tsx is a T-05 file, already tracked, and not modified in the working tree by T-06. Isolation is only meaningful per lane branch, as the reviewer noted before.
- stub-test lens: the session tests drive App for real (redirect, no-flash via MutationObserver, logout clears cache, login then /cvs). The empty-state test would fail a constant shell that lacks the link. Passes.
- non-blocking, for later: (1) LogoutButton has no error path; if POST /auth/logout fails, the cached user stays and nothing is shown. (2) ProtectedBranch is a thin wrapper around RequireSession and could be folded in. (3) the auth-form labels are static, so the App.test.tsx shell-only assertion (T-05 NON-BLOCKING 5) still stands.
- fix-list blocking items: none.
- verdict: approved. plan.md T-06 row is already green (17/17). Nothing committed by the reviewer.
