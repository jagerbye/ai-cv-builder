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
