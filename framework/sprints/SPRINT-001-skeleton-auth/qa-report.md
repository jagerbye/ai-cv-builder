# Sprint 001 — QA report

> **What this file is:** the manual-QA log of record for one sprint (or one
> ad-hoc pass): what was checked, on which env and viewports, every finding
> with evidence, and each finding's lifecycle (open → fixed/accepted). The
> qa-engineer writes findings; `/hotfix` and lanes flip statuses; the sprint
> cannot close over an open blocker.

- **Env/URL:** local Docker stack built from the current tree — web `127.0.0.1:5273`
  (container `vite preview`), api `127.0.0.1:3000`, db `127.0.0.1:5432`.
  **No `ANTHROPIC_API_KEY`**, by design for this pass (F-010).
  · **Date:** 2026-10-29 · **Viewports:** 1440×900 and 375×812
- **Seed:** `scripts/seed-qa.ts` (uncommitted), user `qa.seed@example.test`.
  Re-run once mid-pass, so the CV id changed from `feb86227-…` to `44bcf4ad-…`.

> **Method caveat, read this first.** The shipped stack cannot be driven through
> a browser at all — see **QA-01**. To check anything behind sign-in I stood up a
> throwaway reverse proxy **outside the repo** (`127.0.0.1:5399`) that serves the
> same SPA bytes from 5273 and forwards `/api/*` to 3000. Every finding below
> except QA-01 was observed through that proxy, i.e. against the same build with
> the one missing piece supplied. Nothing in the repo was changed.
>
> 375×812 could not be produced by resizing the window (the OS floor is ~400px),
> so mobile was checked by loading the app in a 375×812 same-origin iframe.
> Media queries, `matchMedia('(min-width:900px)')` and `scrollWidth` were asserted
> to confirm the mobile branch was genuinely active.

- **Scope checked:** `/` front door; `/auth` sign-in and sign-out; the CV editor
  (`/cvs/:id`) — field edit → save → reload, long-content entry, the `userEdited`
  bullet, the question column and answering a question; intake `/cvs/new` incl.
  the empty / non-PDF / too-short rejections; the generation progress view and its
  failure; the CV list `/cvs`.
- **NOT checked:** the PDF happy path (no fixture PDF with a text layer); sign-up;
  the Regenerate button's effect; A4 PDF export; a *successful* generation (no API
  key); keyboard-only and screen-reader passes; 768×1024; measured colour contrast;
  the trash-icon delete confirm flow.

> **The screenshots are not in the repository.** The pass produced 55 of them,
> 1.8 MB, and they were dropped so a reviewer is not wading through a sprint's
> image folder to reach the product. Each finding below still names the shot it
> was taken from, by filename; the finding itself is the record.

## Re-check pass — 2026-10-29

- **Env/URL:** the rebuilt stack, driven **through the real app on
  `127.0.0.1:5273`** (api `127.0.0.1:3000`, db `127.0.0.1:5432`). Still **no
  `ANTHROPIC_API_KEY`**, by design. The throwaway proxy from the first pass was
  **not** needed and was not used; nothing forced me off 5273.
- **Seed:** `npx vite-node scripts/seed-qa.ts` re-run at the start of this pass;
  CV id is now `07930f51-d4da-422a-9d6c-2ce434f53f1f`.
- **Scope:** QA-01…QA-11 only, each re-checked at both viewports. This was not a
  fresh full pass.

> **Viewport caveat, same as last time but worse.** `resize_window` reported
> success but was a no-op for the whole pass — the Chrome window is in a state
> where the viewport stayed pinned at **1512×828**. So "desktop" below means
> 1512×828, not 1440×900; both are above the `min-width:900px` breakpoint, so
> the same desktop branch is exercised, but column widths were not measured at
> exactly 1440. **375×812 was again reachable only through a same-origin
> iframe**, with `innerWidth === 375`, `matchMedia('(min-width:900px)') === false`
> and `scrollWidth === 375` asserted each time to confirm the mobile branch was
> genuinely live. A reliable way to set the viewport is the single biggest thing
> that would improve the next pass.

**Outcome: 8 of 11 fixed, 2 still open (QA-05 major, QA-08 visual), 1 fixed with
a data remnant (QA-10 → QA-14). 3 new findings: QA-12, QA-13, QA-14.**

## Second re-check pass — 2026-10-29 (QA-05, QA-08, QA-12, QA-13, QA-14)

- **Env/URL:** the rebuilt + reseeded stack, driven through the real app on
  `127.0.0.1:5273` (api `127.0.0.1:3000`). Still **no `ANTHROPIC_API_KEY`**, by
  design. No proxy, no workaround: the app was used as shipped.
- **Seed:** `qa.seed@example.test`, CV `992d6775-5826-4a54-a592-7d08c419db2b`.
- **Scope:** only the five findings named above, each at both viewports, plus a
  short regression smoke (sign in → list → editor → edit a field → reload) and
  the read-model ordering check. Not a fresh full pass.

> **Viewport, third time: half solved.** `resize_window` to **1440×900 now
> genuinely works** — `innerWidth === 1440`, confirmed in page, and every
> desktop observation below was made there. Two caveats: the first resize of
> the session drifted back to 1512 on its own and had to be re-issued (measure
> `innerWidth` after every resize, don't trust the call's "success"), and the
> window height gives a 723px viewport, not 900.
> **375px is still not reachable by resizing** — this Chrome clamps the window
> to a **500×772** viewport, so mobile was again checked in a same-origin
> **375×772 iframe**, asserting `innerWidth === 375`,
> `matchMedia('(min-width:900px)') === false` and `scrollWidth === 375` each
> time. 772 rather than 812 because the window height is clamped too; nothing
> in these findings depends on the last 40px.

**Outcome: QA-08, QA-12, QA-13, QA-14 fixed. QA-05 fixed as written (all three
questions now find their field), but one new major, QA-15, replaces its
remaining symptom on desktop. Smoke clean; ordering deterministic.**

## Findings

### QA-01 The shipped web container has no route to the API — the app cannot be used in a browser — severity: blocker
- Where: `http://127.0.0.1:5273/` (the real stack) @ both viewports
- Repro:
  1. `docker compose up`; open `http://127.0.0.1:5273/auth`.
  2. Enter the seeded credentials, press **Log in**.
  3. Network: `POST http://127.0.0.1:5273/api/auth/login` → **404**, empty body.
  4. `curl -i http://127.0.0.1:5273/api/health` → **200 `text/html`** — the SPA's
     `index.html`, not the API. `curl http://127.0.0.1:3000/api/health` → `{"ok":true,"db":true}`.
- Expected / actual: expected `/api/*` from the browser to reach the api service.
  Actual: `web/vite.config.ts` declares no `server`/`preview` proxy and
  `web/Dockerfile` serves the bundle with bare `vite preview`; there is no reverse
  proxy anywhere in `docker-compose.yml`. `web/src/api/client.ts` calls
  `fetch('/api' + path)` same-origin. So **every** GET `/api/*` returns the SPA
  shell with 200/`text/html` (the client's envelope guard turns that into
  `INTERNAL`) and every POST/PATCH returns 404. The user is told
  "Something went wrong. Please try again." and can never sign in.
- Note: the seed step's "QA URL … (HTTP 200)" check is not evidence the screen
  works — 5273 answers 200 with the SPA shell for *any* path, `/api/*` included.
- Evidence: `03-login-fails-on-shipped-stack-5273.jpg`
- Status: **fixed** 2026-10-29 (re-check). `web/vite.config.ts` now sets
  `server.proxy` and `preview.proxy`. `curl -i http://127.0.0.1:5273/api/health`
  returns `200 application/json {"ok":true,"db":true}`, and the whole pass below
  was driven against the real app on **5273** — no throwaway proxy, nothing
  forced me off it. Sign-in, list, editor, PATCH, answer and intake all work
  same-origin. After: `after-QA01-app-works-on-5273-desktop.jpg`

### QA-02 The front door is a 404 — there is no way into the product — severity: blocker
- Where: `http://127.0.0.1:5273/` and `/` via the proxy @ 1440×900 and 375×812
- Repro: open the site root.
- Expected / actual: expected a landing or a redirect to `/auth`. Actual: the
  heading **"Page not found"** and "The address you opened does not match a page
  in this app." — with no link to sign in, sign up or anywhere else.
  `web/src/app/routes.ts` registers `/auth/*`, `/cvs/new`, `/jobs/:jobId`,
  `/cvs/*` and nothing for `/`, so `resolveRoute` returns undefined and
  `App.tsx` renders `NotFound`. A visitor who types the hostname is stuck.
- Evidence: `01-root-404-desktop.jpg`, `…/02-root-404-mobile.jpg`
- Status: **fixed** 2026-10-29 (re-check). Signed out, `/` → `/auth/login`;
  signed in, `/` → `/cvs`. Verified at both viewports.
  After: `after-QA02-root-signed-out-to-signin-desktop.jpg`,
  `after-QA02-QA03-QA07-root-redirects-to-list-desktop.jpg`,
  `after-QA02-QA03-QA07-list-and-header-mobile.jpg`

### QA-03 The CV list always says "You have no CVs yet", so a signed-in user can never reach their CV — severity: blocker
- Where: `/cvs` @ 1440×900 and 375×812
- Repro:
  1. Sign in as the seeded user (who owns 3 CVs).
  2. You land on `/cvs`.
- Expected / actual: expected the list C-007 already serves — `GET /api/cvs`
  returns `{"items":[…3 items…]}` and was verified working. Actual: the heading
  "Your CVs", the line **"You have no CVs yet."** and a "Create your first CV"
  link. `web/src/features/cv/route.tsx` renders that empty state as a static
  branch whenever the path has no id; it never calls `GET /api/cvs`. Combined
  with QA-02 this means that after sign-in there is **no navigation anywhere in
  the product**: the editor is reachable only by pasting a CV id into the address
  bar. Two of the three stored CVs are also untitled and stuck in state
  `generating` (see QA-10), so a real list has rows to design for.
- Evidence: `06-cv-list-says-none-desktop.jpg`, `…/05-header-overlap-and-empty-list-mobile.jpg`
- Status: **fixed** 2026-10-29 (re-check). `/cvs` calls `GET /api/cvs` and
  renders a row per CV — title (falling back to "Untitled CV"), target role,
  state and updated date — each linking to `/cvs/<id>`; hrefs confirmed in the
  DOM at both viewports. A forced `500` on `GET /api/cvs` renders "Something
  went wrong. Please try again." under the "Your CVs" heading instead of the
  empty state, so the claim is no longer made falsely.
  *Residual (not filed separately):* that failure message is the app's generic
  string and carries no retry control, where every other error screen in this
  product is specific and actionable — worth a line whenever QA-08 is picked up.
  After: `after-QA02-QA03-QA07-root-redirects-to-list-desktop.jpg`,
  `after-QA03-failed-list-load-says-so-desktop.jpg`,
  `after-QA02-QA03-QA07-list-and-header-mobile.jpg`

### QA-04 A failed question answer silently desyncs the version and blocks every later save — severity: blocker
- Where: `/cvs/:id` @ 1440×900
- Repro:
  1. Open the seeded CV, answer the "Period" question, press **Save answer**.
  2. `POST …/questions/:id/answer` → **503** (expected without an API key). The
     card says "Your answer is saved, but we could not update the draft."
  3. Now edit any field (I changed Role) and blur it.
  4. `PATCH /api/cvs/:id` → **409 VERSION_CONFLICT**.
- Expected / actual: expected the next edit to save. Actual: a red banner —
  "This CV was changed on another device. Your edits are still shown below;
  Reload latest replaces them with the saved version." — which is **false**: no
  other device touched it. `api/src/core/cv/answer.ts` stores the answer and
  bumps the version *before* recomposing, so the 503 leaves the server at
  version 2; `editor.tsx`'s catch path for 503 never assigns
  `versionRef.current = next.version`, so the editor keeps version 1. It then
  sets `blockedRef` and **stops sending every subsequent save**, and the only
  offered recovery ("Reload latest") throws the user's edits away. Without an API
  key this is the state after *any* answer; with one, after any LLM outage.
- Evidence: `10-answer-recompose-failed-message.jpg`, `…/11-false-version-conflict-after-503.jpg`
- Status: **fixed** 2026-10-29 (re-check). Re-ran the exact repro: answered
  "Period" → `503`, card showed "Your answer is saved, but we could not update
  the draft. Reload the CV to see where it stands." with a **Reload the CV**
  button. Without touching that button I then edited Location → "Leeds, UK" and
  blurred: **no 409, no conflict banner**, server version went 2 → 3 and
  `GET /api/cvs/:id` returns `experience[1].location = "Leeds, UK"`. The editor
  is no longer blocked, and the recovery no longer costs the user their edits.
  After: `after-QA04-answer-503-message-desktop.jpg`,
  `after-QA04-next-save-succeeds-no-false-409-desktop.jpg`

### QA-05 Two of the three question kinds never sit beside their field — the product's one visual idea — severity: major
- Where: `/cvs/:id` @ 1440×900 and 375×812
- Repro: open the seeded CV and look at where each of the three questions lands.
- Expected / actual: expected each card beside (desktop) or under (mobile) the
  field its `path` names. Actual: only `experience[1].period` does.
  The API's own `api/src/core/generation/verify.ts` emits question paths
  **`summary`** (line 112) and **`skills[i]`** (line 172), while the web's
  `questions.tsx` `fieldPathsOf`/`CONTACT_LABELS` only ever produce
  `summary.text` and `skills[i].name`. The seed reproduces the API's shapes
  faithfully, so this is the web side being wrong, and it will hit every real
  generated CV. Consequences, measured in the DOM:
  - **Desktop:** unmatched cards get `top = max(0, cursor)`, so both stack at the
    top of the column — the *Summary* question sits beside the **Email/Phone**
    fields and the *Terraform* question beside **Full name**. No field gets its
    amber rule (`.cv-field-question` count = 0).
  - **Mobile:** both fall into the `loose` bucket appended after the sheet — at
    y=6286 and y=6574 of a 6934px page, roughly 4,000–5,000px below the fields
    they ask about.
  - Both cards' eyebrow degrades to the fallback **"Question about this field"**
    instead of "Question about Summary" / "Question about Skill".
- Evidence (broken): `07-questions-mismatched-paths-beside-contact-desktop.jpg`
  — (working, for contrast): `…/08-question-beside-its-field-desktop.jpg`, `…/09-question-under-its-field-mobile.jpg`
- Status: **fixed** 2026-10-29 (second re-check) — *as written*; see **QA-15**
  for what is left. The seed was the last thing writing the old grammar; it now
  stores what `verify()` returns and the live API serves
  `summary.text`, `skills[5].name`, `experience[1].role`. All **3 of 3** cards
  now find their field: three fields carry the amber left rule
  (`.cv-field-question` count = 3 — Summary, the Brightpath *Role*, the
  *Terraform* Skill) and all three eyebrows are specific — "Question about
  Summary", "Question about Role", "Question about Skill". The fallback
  "Question about this field" is gone. **0 cards failed to match.**
  - **Mobile (375px): 3 of 3 correct.** Each card sits directly under its own
    field, 93px below it in every case (field tops 682 / 2566 / 6232, card tops
    845 / 2659 / 6325 on a 6836px page). The loose bucket is empty — the
    "dumped at the bottom" behaviour from the last pass is gone. This is the
    screen the design doc describes, and on a phone it is now right everywhere.
  - **Desktop (1440px): 2 of 3 placed.** Summary (field 690 / card 703) and
    Skill (4498 / 4511) sit level with their fields, exactly as intended. The
    *Role* card does not — it is filed as **QA-15**.
  After: `recheck2-QA05-summary-question-beside-summary-desktop.jpg`,
  `recheck2-QA05-skill-question-beside-skill-desktop.jpg`,
  `recheck2-QA05-role-question-under-role-field-mobile-375.jpg`

### QA-06 Long content is clipped mid-line in every multiline field — severity: major
- Where: `/cvs/:id` @ 1440×900 and 375×812
- Repro: open the seeded CV, scroll to Experience, look at the first bullet
  (300 characters).
- Expected / actual: expected the box to grow, or at minimum to clip on a line
  boundary. Actual: `fields.tsx` and `entries.tsx` render `<textarea rows={2}>`
  with no auto-grow, so the third line is **sliced horizontally through the
  glyphs** — half a row of letter-tops below two full lines. At 375px every one
  of the six bullets and the summary is clipped this way, because two rows hold
  far less text. The user cannot see their own sentence without selecting into it.
- Evidence: `14-long-bullet-clipped-desktop-zoom.png`, `…/15-long-bullets-clipped-mobile.jpg`
- Status: **fixed** 2026-10-29 (re-check). Every `textarea` now auto-grows:
  measured `scrollHeight === clientHeight` on all of them at both viewports
  (0 clipped). The 300-character bullet renders at 112px on desktop and 256px
  at 375px, fully legible, no mid-glyph slice.
  After: `after-QA06-QA11-textareas-grow-delete-is-a-word-desktop.jpg`

### QA-07 The "Log out" button overlaps the product name in the header — severity: visual
- Where: every signed-in screen @ 1440×900 and 375×812
- Repro: sign in, look at the top-left.
- Expected / actual: expected the brand at the left and the action at the right.
  Actual: `.shell-header` in `app/shell.css` is `display:flex; align-items:center`
  with no `justify-content`, no `gap` and no `margin-left:auto` on the button, so
  "Log out" is painted hard against — and visibly on top of — the last letters of
  "AI CV Builder". It is worse at 375px, where the brand is clipped to
  "AI CV Builde". Present on every protected screen in the product.
- Evidence: `04-header-logout-overlaps-brand-zoom.png`, `…/05-header-overlap-and-empty-list-mobile.jpg`
- Status: **fixed** 2026-10-29 (re-check). `.shell-header` is now
  `justify-content: space-between; gap: 16px`. Desktop: brand right edge 119px,
  button left edge 1392px. At 375×812: 103px vs 271px, and the brand is no
  longer truncated (`scrollWidth === clientWidth`). No overlap on any signed-in
  screen. After: `after-QA02-QA03-QA07-root-redirects-to-list-desktop.jpg`,
  `after-QA02-QA03-QA07-list-and-header-mobile.jpg`

### QA-08 Unstyled native controls escape the design system — severity: visual
- Where: `/cvs` empty state, `/jobs/:id` failed state, `/cvs/new` @ both viewports
- Repro: look at the "Create your first CV" link, the "Regenerate" button and the
  PDF chooser.
- Expected / actual: expected `--color-text-link` (#215E6B) and the product's
  button styles, as `/auth`'s "Create an account" correctly uses. Actual:
  - "Create your first CV" renders in default browser blue (#0000EE), underlined —
    `.screen-message` styles `h1` and `p` only, never `a`;
  - "Regenerate" on the failed-generation screen is a bare `<button>` with no
    class, next to the correctly teal "Generate CV" two screens earlier;
  - the PDF chooser is a raw `<input type="file">`, so it renders the browser's
    own control and the browser's locale (here Russian, "Выберите файл") inside an
    otherwise English product.
- Evidence: `06-cv-list-says-none-desktop.jpg`, `…/20-generation-failed-honest.jpg`, `…/18-intake-non-pdf-rejected.jpg`
- Status: **fixed** 2026-10-29 (second re-check). Both remaining halves land.
  - *PDF chooser:* now a styled control. The native input is
    `.file-picker-input`, visually hidden the correct way (1×1, `clip-path:
    inset(50%)`, off-flow) but still the element that holds the file; the
    visible control is a `<label for>` carrying the product's button styles
    (44px min-height, hairline border, `--radius-sm`) and the English words
    **"Choose file"**, with **"No file chosen"** beside it. The browser's own
    Russian-locale control is gone, at both viewports.
  - *Keyboard:* tabbing from the "Upload PDF" tab lands on the chooser and the
    product's teal focus ring is painted **on the visible label**, via
    `.file-picker-input:focus-visible + .file-picker-button`. Reached by keyboard
    and visible when reached — not just technically focusable.
  - *Chosen file name:* after selecting a file the slot reads
    `my-old-resume.pdf` in place of "No file chosen".
  - *Regenerate on `/jobs/:id`:* no longer a bare `<button>` —
    `class="cv-button"`, hairline border `rgb(133,127,116)`, 6px radius, 44px
    min-height. Its white fill is the product's `--color-surface` (the same as
    "Choose file" and the editor's "Move up"/"Delete"), not the browser default.
  - *The "Create your first CV" link* was again not reachable — the seeded
    account owns CVs. Still unverified, carried as a known gap.
  After: `recheck2-QA08-styled-pdf-chooser-mobile-375.jpg`,
  `recheck2-QA08-choose-file-keyboard-focus-ring-desktop.png`,
  `recheck2-QA08-chosen-file-name-shown-desktop.png`,
  `recheck2-QA08-jobs-regenerate-styled-desktop.jpg`

### QA-09 Sign-in forgets where you were going, and `/auth` stays reachable while signed in — severity: minor
- Where: `/auth/login`, `/cvs/:id` @ 1440×900
- Repro: signed out, open a CV URL → bounced to `/auth/login`; sign in.
- Expected / actual: expected to land on the CV just requested. Actual: lands on
  `/cvs`, which (QA-03) claims there are no CVs — so the requested CV is now
  unreachable. Separately, visiting `/auth` while signed in renders the full
  "Log in" form *and* a "Log out" button in the header at the same time.
- Evidence: `23-auth-desktop.jpg`, `…/24-auth-mobile.jpg`
- Status: **fixed** 2026-10-29 (re-check). Signed out, opening
  `/cvs/07930f51-…` bounces to
  `/auth/login?next=%2Fcvs%2F07930f51-d4da-422a-9d6c-2ce434f53f1f`, and
  signing in lands **on that CV**, not on `/cvs`. Visiting `/auth` while signed
  in redirects to `/cvs` — the form-plus-Log-out state is gone. Both confirmed
  at 375×812 as well.
  After: `after-QA09a-deeplink-survives-signin-desktop.jpg`,
  `after-QA09b-auth-redirects-when-signed-in-desktop.jpg`

### QA-10 A failed generation leaves the CV untitled and in state `generating` forever — severity: minor
- Where: data, visible through `GET /api/cvs` @ n/a
- Repro: submit intake twice (both fail on `CONFIG_MISSING`), then
  `GET /api/cvs`.
- Expected / actual: expected the CV to reflect the job's terminal failure.
  Actual: `{"items":[{"title":"","state":"generating"},{"title":"","state":"generating"},{"title":"QA seed CV","state":"ready"}]}`
  — two permanent ghosts with empty titles. Whoever builds the real list screen
  (QA-03) has to render them, and `/cvs/:id` for one shows an editor with empty
  fields rather than "this one failed".
- Evidence: command output quoted above; no screen renders it today (QA-03)
- Status: **fixed** 2026-10-29 (re-check). Submitted a fresh intake (269
  chars, target role "Staff Engineer"). The job failed on the missing key and
  the CV went to **`state: "failed"`**, not a permanent `generating`. The CV now
  carries its cause: `lastError: {"code":"CONFIG_MISSING","message":"The server
  is not configured for this request."}`. `/jobs/:id` shows "Generation failed"
  / that message / "Your source text is kept, so you can try again." plus
  **Regenerate**; `/cvs/:id` for the same CV shows a red banner with the same
  sentence and a Regenerate button above the (empty) editor. It reads as a
  configuration problem, not as "something went wrong on our side", and the
  `ANTHROPIC_API_KEY` env-var name is no longer shown to the user.
  *See QA-14* for the pre-existing rows the fix does not reach.
  After: `after-QA10-config-failure-regenerate-desktop.jpg`,
  `after-QA10-failed-cv-editor-banner-and-empty-h1-desktop.jpg`

### QA-11 The trash icon is used for skills only; the same action is a word everywhere else — severity: visual
- Where: `/cvs/:id` Skills vs Experience/Education/bullets @ 375×812
- Repro: scroll the editor to Skills, then back to Experience.
- Expected / actual: `framework/docs/design/README.md` keeps exactly one icon,
  `trash`. It is used — correctly and only once — but only in the Skills rows,
  while Experience entries, Education entries and bullets all spell out
  "Delete" / "Delete bullet". Same destructive action, two different affordances
  on one screen. The icon button also has no visible text label.
- Evidence: `22-skills-trash-icon-mobile.jpg`
- Status: **fixed** 2026-10-29 (re-check). `document.querySelectorAll('svg')`
  returns **0** on the editor at both viewports and there are no label-less
  buttons. Skills rows now read "Delete", matching Experience, Education and
  bullets. One affordance for one action.
  *Note for the design doc:* the product now ships **no** icons at all, so
  `framework/docs/design/README.md`'s "exactly one icon, trash" no longer
  describes the build — `docs-sync` applies.
  After: `after-QA11-delete-is-a-word-in-skills-mobile.jpg`,
  `after-QA06-QA11-textareas-grow-delete-is-a-word-desktop.jpg`

### QA-12 Two different page containers ship side by side — severity: visual
- Where: `/auth/*` and `/cvs/new` vs `/cvs` and `/cvs/:id` @ 1440-class and 375×812
- Repro: sign out, look at `/auth/login`, then sign in and look at `/cvs`.
- Expected / actual: expected one page container. Actual: `/auth` and `/cvs/new`
  start their content hard against the left edge (heading at x≈22, no gutter,
  the right two thirds of a desktop screen empty), while `/cvs` and the editor
  are centred inside a gutter (heading at x≈168). The product reads as two
  apps stitched together on the way from sign-in to the list.
- **Not a regression:** the left-hugging screens look the same in the first
  pass's `…/23-auth-desktop.jpg`; it simply was not filed then, and the new
  centred list screen now puts the two conventions one click apart.
- Evidence: `after-QA02-root-signed-out-to-signin-desktop.jpg`
  (left-hugging) vs `…/after-QA02-QA03-QA07-root-redirects-to-list-desktop.jpg` (centred)
- Status: **fixed** 2026-10-29 (second re-check). There is now one `.page`
  container and every screen sits in it, centred, with a real gutter. Measured
  at `innerWidth === 1440`: `/auth/login` → `.page auth-screen` left 500 w440;
  `/cvs/new` → `.page intake` left 500 w440; `/cvs` → `.page cv-list` left 120
  w1200; `/cvs/:id` → `.page cv-page` left 120 w1200; `/jobs/:id` →
  `.page screen-message` left 360 w720. The left-hugging `x≈22` start is gone.
  The three widths are one system, not two apps: narrow for the single-column
  forms, wide for the two data screens, mid for message screens — all the same
  primitive, all centred. At 375px all four headings start at x=16 and
  `scrollWidth === 375` on every one.
  After: `recheck2-QA12-intake-centred-desktop.jpg`

### QA-13 An untitled CV renders an empty `<h1>` in the editor — severity: minor
- Where: `/cvs/:id` for any CV whose `title` is `""` @ 1440-class and 375×812
- Repro: open the CV left behind by the failed generation above.
- Expected / actual: expected the list's own fallback, "Untitled CV". Actual the
  editor renders exactly one `<h1>` whose `textContent` is the empty string, so
  the page opens with the target role ("Staff Engineer") floating under a blank
  heading slot. The list screen gets this right; the editor does not, so the two
  disagree about the same CV. Introduced with the new failed/untitled states —
  before this wave a failed CV was unreachable (old QA-03), so no screen showed it.
- Evidence: `after-QA10-failed-cv-editor-banner-and-empty-h1-desktop.jpg`
- Status: **fixed** 2026-10-29 (second re-check). Opening any untitled CV —
  `/cvs/425ef9cc-…` and `/cvs/6c2967f3-…` — renders `<h1>Untitled CV</h1>`, the
  same fallback the list shows for the same row. The blank heading slot is gone
  and the two screens now agree about the same CV. Confirmed at 1440 and at
  375px.
  After: `recheck2-QA13-QA14-untitled-heading-reconciled-ghost-desktop.jpg`,
  `recheck2-QA13-QA14-untitled-cv-heading-and-retry-mobile-375.jpg`

### QA-14 The QA-10 fix is forward-only: old CVs are still stuck in `generating` — severity: minor
- Where: `/cvs` @ 1440-class and 375×812
- Repro: open the list as the seeded user.
- Expected / actual: QA-10 is genuinely fixed for new jobs, but nothing backfills
  CVs that failed before the fix. `GET /api/cvs` still returns the two ghosts from
  the first pass — `{"title":"","state":"generating"}` — and the new list screen
  now renders them as two "Untitled CV / Generating" rows that will never change
  and offer the user nothing to do. Before this wave they were invisible (old
  QA-03); the list screen is what makes them a user-facing defect. Needs a
  migration, or a UI rule that treats a long-stale `generating` as failed.
- Evidence: `after-QA02-QA03-QA07-list-and-header-mobile.jpg`
- Status: **fixed** 2026-10-29 (second re-check). **Which way: failed, with a
  message and a retry** — not absent. The api reconciles stale `generating` rows
  at startup, and after the restart `GET /api/cvs` returns **no `generating`
  row at all**; both former ghosts are `state: "failed"` carrying
  `lastError: {"code":"INTERNAL","message":"The generation was interrupted and
  did not finish. Regenerate to try again."}`. The list shows them as
  "Untitled CV … Failed", and opening one shows the red banner with that exact
  sentence plus a **Regenerate** button, so the row is now something the user
  can act on. The message names the interruption rather than blaming the user,
  and it is distinct from the `CONFIG_MISSING` wording on the key-less CV —
  two different causes, two different sentences.
  After: `recheck2-QA14-no-generating-ghosts-left-desktop.jpg`,
  `recheck2-QA13-QA14-untitled-heading-reconciled-ghost-desktop.jpg`

### QA-15 On desktop the question column places cards in API order, so the third card is stranded 2,957px below its field — severity: major

- Where: `/cvs/:id` @ 1440×900 (desktop only — mobile is correct)
- Repro: open the seeded CV at ≥900px and look for the *Role* question.
- Expected / actual: expected the "Question about Role" card level with the
  Brightpath **Role** field, the way the Summary and Skill cards are level with
  theirs. Actual: the Role field is correctly marked (amber left rule, and the
  card's eyebrow does say "Question about Role"), but the column beside it is
  **empty**, and the card is parked at the very bottom of the page, below the
  Skill card and below the end of the white sheet — field top **1838**, card top
  **4795**, on a 5034px page. A user who sees the amber rule on Role has no
  question next to it, and a user who scrolls to the bottom finds a question
  with no field next to it.
- Cause (visible from the outside, worth confirming in code): the cards render
  in the API's `questions[]` order — the DOM order of the eyebrows is
  **Summary → Skill → Role**, which is exactly the order
  `GET /api/cvs/:id` returns (`summary.text`, `skills[5].name`,
  `experience[1].role`) — while the fields they point at run
  Summary → Role → Skill down the page. The column's measure-and-push places
  each card at `max(cursor, fieldTop)`, so once the Skill card has pushed the
  cursor to ~4500 the Role card can never walk back up to 1838. **This is the
  new deterministic read-model ordering meeting a column that assumes API order
  equals document order.** Sorting the cards by their field's measured offset
  before the push would fix it; so would sorting the questions by section order.
- **Relationship to QA-05:** QA-05 (paths/matching) is genuinely fixed —
  3 of 3 cards find their field, and on mobile 3 of 3 are placed correctly.
  This is a different, newer cause with the same user-visible shape on desktop,
  so it is filed separately rather than reopening QA-05.
- Evidence: `recheck2-QA05-role-field-marked-but-column-empty-desktop.jpg`
  (the marked field with nothing beside it),
  `recheck2-QA05-role-card-stranded-below-skills-desktop.jpg`
  (the card, two screens later, under the Skill card and past the sheet)

## Regression smoke — 2026-10-29 (second re-check)

Ran after the rebuild, looking only for damage from the file control, the
container rule and the read-model ordering. **No regressions.**

- Sign out → `/auth/login` → sign in with the seeded user → lands on `/cvs`;
  the list renders all five rows with working `/cvs/<id>` hrefs.
- Editor opens; Location edited "London, UK" → **"Bristol, UK"**, committed on
  blur, and still "Bristol, UK" after a full reload.
- Header, textareas and the trash-icon fix (QA-06, QA-07, QA-11) all still hold
  on the screens passed through; no horizontal scroll at either viewport.
- **Console: zero messages of any kind** across list, editor, intake and
  `/jobs/:id`.
- **Ordering is deterministic.** Two consecutive reloads of the same CV return
  the sections, the entries inside them, every bullet and every skill in the
  **identical** order — asserted by comparing the full ordered label sequence
  and the full ordered value sequence of all inputs/textareas across reload 1 vs
  reload 2 (both identical), and a third read of `GET /api/cvs/:id` agreed with
  the first two (experience Senior Software Engineer → Software Engineer →
  Junior Developer; skills TypeScript → Go → PostgreSQL → Kubernetes → AWS →
  Terraform). The ordering change did what it claims — QA-15 is a consequence of
  *which* order the questions are in, not of it being unstable.

## What looked good

- **The question column is real, and when the path matches it is exactly the
  idea the design doc describes.** The `experience[1].period` field gains an amber
  left rule and its card sits level with it on desktop, and directly beneath it on
  mobile. Nothing overlaps; the measure-and-push placement in `QuestionColumn`
  held at both viewports. Fix QA-05 and this is the product's best screen.
- **Editing saves and sticks.** Full name, Phone and Location each PATCHed 200,
  showed a quiet green "Saved" at the top-right, and survived a full reload.
  Commit-on-blur means a failed save never takes the typed text away.
- **The 503 answer message is literally true, which is the hard part.** It says
  "Your answer is saved, but we could not update the draft." I checked: the
  question is `answered`, a user fact `March 2019` exists, version bumped to 2.
  It does **not** read as "your answer was lost", and it should not — the answer
  was kept. (Its knock-on effect is QA-04, but the sentence itself is honest.)
- **The generation failure is honest and legible.** "Generation failed" /
  "ANTHROPIC_API_KEY is not configured; generation is unavailable." / "Your
  source text is kept, so you can try again." — the real cause, not a shrug, plus
  a reassurance that is true. The only quibble is that an end user should
  probably not be shown an env-var name.
- **Intake validation is the best writing in the product.** "Your text is 41
  characters. Add at least 159 more (the minimum is 200): the roles you held,
  what you built, and the results you got." Specific, actionable, no blame. The
  live character counter and the non-PDF and empty-form rejections are equally clear.
- **Mobile intake defaults to "Paste text"**, which is the right call on a phone,
  and no screen scrolled horizontally at 375px (`scrollWidth === 375` everywhere).
- **Design discipline holds.** Against `framework/docs/design/design.json`: amber
  appears only on question cards and question field rules; red only on genuine
  errors (the login failure, the conflict banner, intake rejections, the answer
  error); success green only on "Saved". Exactly one icon ships (trash). The
  warm page / white sheet / single teal accent reads as intended.
- Sign-out works, clears the session, and a protected URL correctly bounces to
  `/auth/login`.

## Console / network notes

- **Zero console output of any kind** across every flow — no errors, no warnings,
  no React key or hydration noise. `read_console_messages` was run on the editor,
  intake, progress and list flows and returned nothing each time.
- **Failed/odd requests seen:** `POST /api/auth/login` → 404 and `GET /api/health`
  → 200 `text/html` on the real stack (QA-01); `POST …/answer` → 503 (expected, no
  key); `PATCH /api/cvs/:id` → 409 (QA-04); `GET /api/cvs/feb86227-…` → 404 after
  the mid-pass re-seed (expected — the old id was deleted).
- **Not a finding, recorded so nobody re-chases it:** the progress view appeared
  frozen on "Queued. It will start shortly." while the job had already failed, and
  made only one `GET /api/jobs/:id`. That is my harness, not the app: the
  automation tab reports `document.hidden === true`, and TanStack Query pauses
  `refetchInterval` on a hidden document. I confirmed it by submitting a fresh
  job, then overriding `document.visibilityState` to `visible` and dispatching
  `visibilitychange` — the screen moved from "Queued. It will start shortly." to
  the full "Generation failed" state within the poll interval, with no reload.
  **Polling works.** A plain reload also shows the correct failed screen.
- The progress screen itself carries no `h1` while queued or running — just one
  grey sentence on an otherwise empty page — where every other screen in the app
  leads with a heading. Not filed separately; worth a line when QA-08 is picked up.

## Re-check verdict — 2026-10-29

**The sprint cannot close yet, but it is close: all four blockers are gone.**

- **QA-01, QA-02, QA-03, QA-04 — all four blockers verified fixed.** The product
  is usable end to end in a real browser on the shipped stack for the first
  time: front door → sign-in (deep link preserved) → list → editor → edit →
  save → reload, with a clean console and no horizontal scroll at either
  viewport. That is the sprint's goal, and it is met.
- **Blocking close: QA-05 (major) — not fixed.** Two of the three question kinds
  still never reach their field, and the API still emits the bare `summary` /
  `skills[5]` paths the first report named. The question column *is* the
  product's one visual idea; shipping it working one time in three is shipping
  it broken. Either the API must emit `summary.text` / `skills[i].name`, or the
  web must match the bare forms — but the fix note claims this landed, and it
  did not, so whoever picks it up should start by re-reading
  `api/src/core/generation/verify.ts` against `web/src/.../questions.tsx`.
- **Should not close over QA-08 (visual) either.** The native, Russian-locale
  file chooser is the first control a new user touches on the intake screen, and
  the `/jobs/:id` Regenerate button is still class-less. Both are small.
- **QA-12, QA-13, QA-14 are new and all minor/visual** — none blocks, but QA-13
  and QA-14 are both artifacts of this wave's new screens and are cheapest to
  fix now, while the code is warm.
- **Recommendation:** one `/hotfix` wave on **QA-05 + QA-08**, then re-check
  only those two screens; QA-12/13/14 can ride along or go to the backlog. Do
  not close the sprint on the blocker count alone.
- **Still not checked** (unchanged from the first pass): the PDF happy path, a
  successful generation, sign-up, A4 export, keyboard-only and screen-reader
  passes, 768×1024, measured colour contrast — plus, new this pass, the
  Regenerate button's actual effect and the `/cvs` empty state.

## Second re-check verdict — 2026-10-29

**The sprint still cannot close, and the one thing blocking it is QA-15.**

- **Four of the five flipped: QA-08, QA-12, QA-13, QA-14 are fixed**, each
  verified at 1440 and at 375px. The intake screen's first control is now the
  product's own, keyboard-reachable and in English; every screen sits in one
  centred container; an untitled CV reads the same in the editor as in the list;
  and no CV is stuck in `generating` any more — the two ghosts came back as
  **failed, with a cause and a Regenerate button**.
- **QA-05 is fixed as it was written.** The seed was indeed the last writer of
  the old grammar. All three questions now find their field, all three eyebrows
  are specific, and **on mobile all three cards sit under their own field** —
  the first time the product's one visual idea works everywhere on a phone.
- **Blocking close: QA-15 (major, new).** On desktop the third card is stranded
  2,957px below the field it asks about, because the column places cards in the
  API's question order and the new deterministic read model orders questions
  summary → skills → experience, which is not document order. It is a small,
  well-understood fix (sort the cards by their field's measured offset), but it
  is the same user-visible defect QA-05 described, on the product's signature
  screen, at the viewport most people will use it on. Shipping it two times in
  three is still shipping it broken.
- **Recommendation:** one `/hotfix` on **QA-15 alone**, then re-check one
  screen at one viewport — the editor at 1440, counting cards level with their
  fields. Everything else in this report is closed.
- **Still not checked** (unchanged): the PDF happy path, a successful
  generation, sign-up, A4 export, keyboard-only and screen-reader passes beyond
  the file control, 768×1024, measured colour contrast, the `/cvs` empty state
  and the "Create your first CV" link, and the Regenerate button's actual effect.
