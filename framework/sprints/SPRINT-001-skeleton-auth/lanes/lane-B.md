# Lane B — QA fixes (sprint 01, stage 4.5)


## Test-engineer step (QA-02, QA-03, QA-09) — RED

Test files added or changed (no production code):
- `web/src/app/front-door.test.tsx` (new): QA-02 `/` signed out → `/auth/login`; signed in → `/cvs`.
- `web/src/features/cv/list.test.tsx` (new): QA-03 `/cvs` fetches `GET /api/cvs`; rows show title, target role, state, updated date from C-007 items, each linking to `/cvs/<id>`; real empty state; no empty-state claim while loading; error cases on a 500 envelope and on a network failure.
- `web/src/features/auth/signed-in-redirect.test.tsx` (new): QA-09 `/auth/login` and `/auth/signup` signed in → `/cvs`; negative control: signed-out `/auth/login` keeps the form.
- `web/src/features/auth/deep-link.test.tsx` (new): QA-09 sign-in from `/cvs/cv-1` lands on `/cvs/cv-1` and loads it; negative: a later plain sign-in lands on `/cvs`.
- `web/src/features/auth/session.test.tsx` (edited): the `api()` helper answers `GET /api/cvs` with `{items: []}` so existing tests that open `/cvs` keep their stub faithful to C-007. No assertion changed.

RED confirmation (vitest, lane command plus `src/features/cv/list`): 10 failed, 54 passed.
- `/` → `expected '/' to be '/auth/login'` and `expected '/' to be '/cvs'`.
- `/cvs` list → `Unable to find an element with the text: Payments backend`.
- Loading state → `expected <p></p> to be null` (the static empty-state line shows before the fetch resolves).
- List 500 / network error → `Unable to find role="alert"`.
- Deep link → `expected '/cvs' to be '/cvs/cv-1'`.
- Signed-in `/auth/login`, `/auth/signup` → `expected '/auth/login' to be '/cvs'`.

Passing on purpose (guards that must stay green): the signed-out `/auth/login` form control, and the "plain sign-in lands on /cvs" negative.
