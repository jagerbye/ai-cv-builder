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
- Evidence: `framework/sprints/SPRINT-001-skeleton-auth/qa-screenshots/03-login-fails-on-shipped-stack-5273.jpg`
- Status: open

### QA-02 The front door is a 404 — there is no way into the product — severity: blocker
- Where: `http://127.0.0.1:5273/` and `/` via the proxy @ 1440×900 and 375×812
- Repro: open the site root.
- Expected / actual: expected a landing or a redirect to `/auth`. Actual: the
  heading **"Page not found"** and "The address you opened does not match a page
  in this app." — with no link to sign in, sign up or anywhere else.
  `web/src/app/routes.ts` registers `/auth/*`, `/cvs/new`, `/jobs/:jobId`,
  `/cvs/*` and nothing for `/`, so `resolveRoute` returns undefined and
  `App.tsx` renders `NotFound`. A visitor who types the hostname is stuck.
- Evidence: `…/qa-screenshots/01-root-404-desktop.jpg`, `…/02-root-404-mobile.jpg`
- Status: open

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
- Evidence: `…/qa-screenshots/06-cv-list-says-none-desktop.jpg`, `…/05-header-overlap-and-empty-list-mobile.jpg`
- Status: open

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
- Evidence: `…/qa-screenshots/10-answer-recompose-failed-message.jpg`, `…/11-false-version-conflict-after-503.jpg`
- Status: open

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
- Evidence (broken): `…/qa-screenshots/07-questions-mismatched-paths-beside-contact-desktop.jpg`
  — (working, for contrast): `…/08-question-beside-its-field-desktop.jpg`, `…/09-question-under-its-field-mobile.jpg`
- Status: open

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
- Evidence: `…/qa-screenshots/14-long-bullet-clipped-desktop-zoom.png`, `…/15-long-bullets-clipped-mobile.jpg`
- Status: open

### QA-07 The "Log out" button overlaps the product name in the header — severity: visual
- Where: every signed-in screen @ 1440×900 and 375×812
- Repro: sign in, look at the top-left.
- Expected / actual: expected the brand at the left and the action at the right.
  Actual: `.shell-header` in `app/shell.css` is `display:flex; align-items:center`
  with no `justify-content`, no `gap` and no `margin-left:auto` on the button, so
  "Log out" is painted hard against — and visibly on top of — the last letters of
  "AI CV Builder". It is worse at 375px, where the brand is clipped to
  "AI CV Builde". Present on every protected screen in the product.
- Evidence: `…/qa-screenshots/04-header-logout-overlaps-brand-zoom.png`, `…/05-header-overlap-and-empty-list-mobile.jpg`
- Status: open

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
- Evidence: `…/qa-screenshots/06-cv-list-says-none-desktop.jpg`, `…/20-generation-failed-honest.jpg`, `…/18-intake-non-pdf-rejected.jpg`
- Status: open

### QA-09 Sign-in forgets where you were going, and `/auth` stays reachable while signed in — severity: minor
- Where: `/auth/login`, `/cvs/:id` @ 1440×900
- Repro: signed out, open a CV URL → bounced to `/auth/login`; sign in.
- Expected / actual: expected to land on the CV just requested. Actual: lands on
  `/cvs`, which (QA-03) claims there are no CVs — so the requested CV is now
  unreachable. Separately, visiting `/auth` while signed in renders the full
  "Log in" form *and* a "Log out" button in the header at the same time.
- Evidence: `…/qa-screenshots/23-auth-desktop.jpg`, `…/24-auth-mobile.jpg`
- Status: open

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
- Status: open

### QA-11 The trash icon is used for skills only; the same action is a word everywhere else — severity: visual
- Where: `/cvs/:id` Skills vs Experience/Education/bullets @ 375×812
- Repro: scroll the editor to Skills, then back to Experience.
- Expected / actual: `framework/docs/design/README.md` keeps exactly one icon,
  `trash`. It is used — correctly and only once — but only in the Skills rows,
  while Experience entries, Education entries and bullets all spell out
  "Delete" / "Delete bullet". Same destructive action, two different affordances
  on one screen. The icon button also has no visible text label.
- Evidence: `…/qa-screenshots/22-skills-trash-icon-mobile.jpg`
- Status: open

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
