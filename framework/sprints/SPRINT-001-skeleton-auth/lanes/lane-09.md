# Lane 09 — wave B

> Lane log. Each task appends: what changed, the lane test command and its
> result, docs touched, decisions needed, `time:` per role.


## T-22 — CV editor (test-engineer, RED step)

**Files added (tests only, no production code):**
- `web/src/features/cv/testkit.tsx` — shared fake API (fetch only), two CV fixtures, mount helper, DOM contract in its header comment
- `web/src/features/cv/route.test.tsx` — fetch/render, edit in place, add/delete/reorder, icon rule (20 tests)
- `web/src/features/cv/save.test.tsx` — PATCH version rule, 409, failed saves, reload survival (13 tests)
- `web/src/api/client.test.ts` — appended a describe block: PATCH body and method, 409 VERSION_CONFLICT single request, unknown code maps to INTERNAL (3 tests)

**Criteria to tests:**
- Fetch and render (C-006): route.test "GETs the CV named in the path…", "renders the summary and each experience entry…", "renders the education entry and the skills… not the other one". Errors: "404 envelope…", "non-JSON 500…".
- Edit every field: route.test "commits a contact edit…", "every generator-written field saves its edited value…" (14 fields). Error: "400 VALIDATION…".
- Add, delete, reorder: route.test add (experience, education, skill, bullet), delete (entry, bullet, education, skill), move (entry, bullet, skill). Negatives: empty new skill not saved; Move up disabled on first entry.
- PATCH carries the read version (C-008): save.test first three tests. Saving… / Saved: save.test "shows Saving…".
- 409: save.test three tests in the 409 block. Message shown as role=alert, typed text kept, no automatic retry, Reload latest refetches. Error case: 409 on a delete.
- Failed saves keep text: save.test 500 (Retry resends same version) and network failure (text kept, unsaved text gone after reload).
- Survive reload, no navigation: save.test two tests; localStorage and sessionStorage stay empty.
- Design icon rule: route.test "uses text for every control…" (every svg sits in a 'Delete skill …' button; Move buttons are text only).

**RED confirmation (gate, lane-scoped):** `GATE_LANE_TEST='npm -w web run test -- --run src/features/cv src/api' bash framework/scripts/gate.sh` — lint passes; lane tests: 9 passed, 28 failed. Every failure is `TestingLibraryElementError` (missing region 'Experience', 'Contact', textbox 'Email', 'Something went wrong…', 'No CV with that id.'), because `features/cv/route.tsx` is still the empty "Your CVs" state. No import, syntax or typo errors. `tsc --noEmit -p web/tsconfig.json` is clean.

**Passing now (by design):** the 3 new client tests and the 6 existing client tests. They pin behaviour the editor relies on and need no production change.

**Not covered by a unit test (decision needed):**
- 375px and 1440px layout: happy-dom has no layout engine. testing-strategy.md puts CSS/layout under manual QA with screenshots. Unless the Orchestrator wants a CSS-source assertion, this criterion has no automated test.
- The userEdited badge and the questions column are not in the T-22 acceptance list, so no tests were written for them.

**Assumptions the developer must follow (recorded in testkit.tsx header):** commit on blur; trash icon only on 'Delete skill <name>'; entry delete is the text 'Delete'; sections are `<section>` named by heading; a 409 shows role=alert 'This CV was changed on another device.' with 'Reload latest'.

**Docs touched:** none.
**time:** test-engineer — not recorded by this run.

## T-22 — CV editor (developer, GREEN attempt, blocked on test defects)

**Files:** `web/src/features/cv/{route.tsx,editor.tsx,entries.tsx,fields.tsx,draft.ts,types.ts,trash-icon.tsx,cv.css}`; `web/src/api/client.ts` (exports `GENERIC_MESSAGE`).
**Lane test:** 30 passed, 7 failed (37). `tsc --noEmit` clean. Gate reached lane-test and failed there.
**Blocked on test defects (not production code):**
- route.test "deletes an experience entry", "moves an experience entry up", "disables Move up…" and save.test 409 "delete": `within(article).getByRole('button', {name: 'Delete' | 'Move up'})` matches the entry's own button AND the bullet buttons of the same name inside that article. The testkit contract puts both inside `<article>`, so these queries cannot be unique. Needs a decision on bullet control names or scoping.
- save.test "shows Saving…": `findByRole('textbox', {name: 'Location'})` is unscoped and matches both Contact Location and the Experience Location of exp-1.
- save.test 409 (conflict, Reload latest, delete): `api.setServer(..., version 9)` runs before `mountEditor`, so the page reads version 9 and no conflict occurs. The stale-read setup must mount, wait for load, then setServer.
**Open:** 375px/1440px layout has no automated check (cv.css written mobile-first, tokens only).
