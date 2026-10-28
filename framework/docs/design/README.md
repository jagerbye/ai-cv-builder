# framework/docs/design — design spec for AI CV Builder

> **What this folder is:** the design source of truth for this product.
> `design.json` holds every colour, size, radius, shadow and component token;
> this file says what the screens look like, how the primitives behave in
> every state, and what was deliberately left out. There is no Figma on this
> project (`framework/process/integrations.md`), so these two files are what
> the web lane builds from and what QA measures against.
>
> Rule: every value in `web/` CSS exists in `design.json` first. An orphan hex
> code in a component is a docs-sync violation. Need a value that is not
> here → change the JSON, then the component.

## 0. Direction in one paragraph

The user is anxious about a job application and is handing a machine their
working life. The interface therefore behaves like a careful editor at a
quiet desk: the CV is a white sheet on a warm paper-coloured page, the chrome
is small and grey, there is exactly one accent colour (a deep teal, used only
for things the user can do), and amber is reserved for the product's one
distinctive object — a question attached to a field. No gradients, no big
radii, no illustrations, no percentages. Everything that moves does so to
confirm something true (a save landed, a stage is running).

## 1. How to read `design.json`

- Top level: `meta`, `colors`, `typography`, `spacing`, `radius`, `border`,
  `shadows`, `motion`, `breakpoints`, `layout`, `components`, `icons`,
  `design_principles`. Downstream readers keyed on `meta` + grouped objects
  keep working.
- Token → CSS variable is mechanical: `colors.question.rule` →
  `--color-question-rule`, `spacing.6` → `--space-6`, `radius.md` →
  `--radius-md`, `typography.scale.h2.size` → `--text-h2-size`.
- Values inside `components.*` that read like a path (`colors.accent.default`)
  are references; a component never introduces a new raw value.
- Type and spacing are implemented in `rem` (base 16px); borders, radii and
  shadows stay in `px`.
- `motion.*` tokens each name their `prefers-reduced-motion` fallback. Apply
  it with a single media query at the root, not per component.

## 2. Foundations

### 2.1 Colour

| Role | Token | Hex | Measured contrast |
|---|---|---|---|
| Page (desk) | `colors.page` | `#F6F4EF` | — |
| Sheet / cards / inputs | `colors.surface` | `#FFFFFF` | — |
| Sunken (hover, quotes, disabled) | `colors.surface_sunken` | `#EEEBE4` | — |
| Text primary | `colors.text.primary` | `#1C1B18` | 15.7 on page, 17.2 on surface |
| Text secondary | `colors.text.secondary` | `#5B5852` | 6.5 on page, 7.1 on surface, 6.0 on sunken |
| Text muted | `colors.text.muted` | `#6E6A62` | 4.9 on page, 5.4 on surface |
| Placeholder | `colors.text.placeholder` | `#7A766D` | 4.5 on surface |
| Accent (actions, links, focus) | `colors.accent.default` | `#215E6B` | 7.3 white-on-accent, 6.6 on page |
| Input border | `colors.border.input` | `#857F74` | 4.0 on surface (non-text ≥3) |
| Question text | `colors.question.text` | `#6B4E00` | 7.1 on question bg |
| Question rule | `colors.question.rule` | `#8A5F00` | 5.2 on question bg |
| Success text | `colors.success.text` | `#1F6B4A` | 5.6 on success bg |
| Danger text / border | `colors.danger.text` | `#B3261E` | 5.6 on danger bg, 6.5 on surface |

Rules: amber means "we need you", never "something broke" — errors are red
and only red. The accent appears only on interactive things; a non-clickable
element is never teal. `colors.border.subtle` (1.5:1) is for decorative
dividers only; anything that delimits an input uses `border.input`.

### 2.2 Typography

System font stack for both UI and the document; **no webfont**. Reasons: the
A4 PDF embeds its own Unicode font server-side (ADR-005 path), the editor is
a structured document and not a print preview, and a webfont would add a
dependency-shaped thing to a list that is deliberately closed. The document
has its own `typography.font.document` token so that, if the export font is
ever served on the web, exactly one value changes.

Scale (mobile; only `h1` grows at ≥900px): caption 14/20 · label 14/20 500 ·
body 16/24 · body_strong 16/24 600 · lead 18/28 · h3 18/24 600 · h2 22/28 600
· h1 28/34 600 (32/38 desktop) · document_name 24/30 600 · section_eyebrow
14/20 600 uppercase +0.06em. Weights are 400/500/600 only. Nothing below
14px anywhere, including badges and counters. Inputs are never below 16px on
viewports under 900px (iOS zoom). Text measure is capped at `72ch`.

### 2.3 Spacing, radius, border, shadow

4px scale (`spacing.1`…`spacing.16`). Gutters: 16px mobile, 32px desktop.
Radii are small on purpose: 4 (inline field, skeleton), 6 (inputs, buttons,
question card), 10 (cards), 14 (nothing yet; reserved), pill (badges).
Borders: 1px hairline, 2px emphasis (error, focus-adjacent), 3px rule (the
left rule on questions, callouts, source quotes). Shadows exist for two
things only: the sheet on desktop (`shadows.sheet`) and the focus ring
(`shadows.focus`, a 2px white gap + 2px accent so it reads on any surface).

### 2.4 Breakpoints and layout

Mobile-first, `min-width` queries only: `600px` (sm: progress goes
horizontal, empty states centre, auth card gets side margins), `900px`
(two-column editor, compact 36px buttons allowed, intake default tab flips to
Upload), `1200px` (content max). Grid at ≥900: `minmax(0, 720px) 360px`,
gap 32px, centred in 1200px.

## 3. The question-attached-to-a-field pattern

This is the one visual idea the product lives or dies by, so it is specified
first and the screens are built around it.

**The object.** A question is bound to one CV path (`experience[1].period`).
Visually it is *one object shown twice*: the field gains an amber left rule
(`border.rule` × `colors.question.rule`) with 12px of left padding, and an
amber card (`components.question`) carries the question text, the vague fact
if any, an answer textarea and two buttons. Hovering or focusing either half
puts the other into its `linked` state (`colors.question.bg` on the field,
`bg_hover` on the card). They are never separated by anything else.

**Mobile (<900px).** The card renders *inside the sheet*, directly under the
field it belongs to, 8px below it, full width of the section. There is no
questions list at all; the user meets each question exactly where the gap
is while reading top to bottom. The sticky bottom bar shows "3 questions"
as a quiet button that scrolls to the next unanswered one.

**Two columns (≥900px).** The card renders in the 360px right column and is
top-aligned with its field: the column is `position: relative`; each card is
absolutely positioned at `field.offsetTop` (re-measured on resize and after
any sheet content change) and pushed down only as much as needed to avoid
overlapping the previous card. The column header reads "Questions · 3" in
`h3`, with the no_questions / all_answered empty state when the list is
empty. Cards scroll with the document; the column header is sticky at 80px.

**Answering.** Focus in the textarea → card in `answering` state. "Save
answer" (primary, 44px) → `saving` (button spinner, inputs locked) → on
success the card flips to `answered` (green bg, the word "answered") for 1.8s, then
leaves the list; the field drops its amber rule and shows the neutral badge
"answered"; only that section re-renders (spec §3.5 guarantees the rest is
byte-identical, so no layout jump elsewhere). A follow-up question arrives as
a new card with the eyebrow "One more thing about …" and a `follow-up`
badge; after one follow-up the field stays empty with the placeholder "Add …"
and a grey (not amber) rule — the product does not nag. "Skip for now" moves
the card out and leaves the field with a grey rule and the badge "left
blank". A failed save shows a danger caption under the textarea and a
"Retry" quiet button; the answer text is never cleared.

**Source quotes.** Any generated line has a `Show source` quiet caption
button at its end (visible on hover/focus on desktop, always visible as the
14px caption "Source" on mobile). It expands `components.source_quote` under the
line: sunken block, 3px grey left rule, 14px secondary text, the supporting
span highlighted with `colors.selection_bg` when offsets exist, and an
attribution line ("From your uploaded CV · page 2" or "From your answer on
28 Oct"). User-sourced facts use the accent for the rule, so the user can
tell at a glance which lines are theirs. The textarea in a question card can
show the same block above it under the label "What we found:" when the
question carries a vague fact.

**Ordering.** Server order is preserved (most load-bearing first) in the
column; on mobile the order is simply document order, which is why the
sticky bar's "next question" exists — it follows the server's priority.

## 4. Screens

Each screen is described at 375×812 first, then at ≥900px. QA screenshots
both per sprint (spec §3.9).

### 4.1 CV editor (the main surface)

**375px.** Sticky header 56px (wordmark left, "My CVs" quiet link right).
Below it, on the page colour, a 16px-padded strip: CV state badge
(`badge.cv_state_map`), target role in `caption`, "Saving…/Saved" indicator
right-aligned. Then the sheet, full-bleed (radius 0, no side border, 20/16
padding), sections in order: Contact (name as `document_name`, then email /
phone / location / links as inline fields, each its own 44px row), Summary
(one `textarea`-style inline field), Experience (entries: employer `h3`,
role `body_strong`, period `caption` secondary; bullets with em-dash hanging
indent; each bullet an inline field; "Add bullet" quiet button; entry
footer row with "Move up / Move down / Delete" quiet buttons at 44px),
Education (same shape, no bullets), Skills (chips rendered as 36px-tall
editable pills with a 44px hit area; "Add skill" quiet button). Each section
has a `section_eyebrow` and a hairline divider above. Questions sit under
their fields (§3). Bottom: sticky action bar with "Download PDF" (primary)
and "N questions" (quiet); the bar hides while any inline field has focus so
the keyboard never covers an input, and the sheet has
`keyboard_safe_bottom_padding` so the last field can scroll above the
keyboard.

**≥900px.** Header 64px. The strip becomes a row: CV title (`h1_desktop`,
editable inline), state badge, target role, right side "Download PDF"
primary + "Delete CV" danger_quiet. Two-column grid; the sheet gets
`shadows.sheet`, radius 10, 48/56 padding, max 720px. Questions column per
§3. No sticky bar. Compact 36px buttons allowed for in-entry actions only.

States: `generating` (CV exists, draft not yet) → the editor route shows the
progress view (§4.2) in place of the sheet. `failed` → danger callout above
an empty sheet: "Generation failed: <reason>. Your source text is safe." with
"Try again" primary (calls regenerate) and "Show source text" quiet. Stale
version (409 on PATCH) → danger callout pinned above the sheet: "This CV was
changed on another device." with "Reload latest" secondary; the local edit
is kept in the field until the user reloads. Offline/network error on save →
the field's `save_error` state; nothing is lost.

### 4.2 Progress view

Shown inside the editor route while the job is `queued|running`, restored
from the server on reload (spec §3.3). Page colour background; a `card.form`
centred (max 440px, left-aligned text on mobile). Title `h2` "Building your
draft"; sub `caption` with the target role. Then `components.progress_stage`:
vertical at 375px (24px markers, 32px connectors), horizontal from 600px.
Stage copy is human: "Reading your CV" · "Writing the draft" · "Checking
every line against the source". The current stage pulses (ring opacity,
1.6s; static 2px ring under reduced motion); done stages are filled accent
with a check; pending are hollow grey. Under the stages: "Running for 0:42"
in tabular numerals, updated every second. After 45s the reassurance line
appears ("…never more than three minutes. You can close this tab…"). `queued`
shows the first marker hollow with the label "Waiting to start" and no
elapsed counter. On `failed` the current marker turns red with an x and the
view is replaced by the editor's failed state. No percentage, no bar, no
"almost there". `aria-live="polite"` announces only stage changes.

### 4.3 Intake

Route "New CV". `card.form` variant at 640px max; full-bleed on mobile with
16px padding. Title `h1` "Start from what you have". Tabs (underline,
44px, equal width on mobile): **Paste text** | **Upload PDF** — Paste is the
default below 900px, Upload at ≥900px (spec §3.9). Paste panel: `textarea`,
min 200px tall on desktop and 40vh max on mobile, autogrow, counter "214 /
50 000" bottom right that turns red below 200 and above 50 000, hint "At
least 200 characters — roles, dates, what you did." Upload panel:
`dropzone`; on mobile the whole zone is the OS picker and reads "Choose a
PDF"; after selection it shows name, size and "Remove". Below both tabs, the
required `text_input` "Target role" with hint "The job title you are
applying for, e.g. Senior Backend Engineer" (1–120 chars; counter appears at
100). Primary button "Build my draft", full width on mobile, right-aligned
on desktop; disabled until the active tab's input and the role are valid;
`loading` state while POSTing (returns within 2s). Server rejections render
as a danger callout above the button with the server's own message (scan
with no text layer, >10MB, >20 pages) and switch focus to the callout; the
"scan" message additionally offers a quiet "Paste the text instead" that
flips the tab. Tab switching never clears the other tab's input.

### 4.4 Auth

Two routes, same `card.form` at 440px (full-bleed with 16px padding on
mobile, centred card from 600px with 32px padding and the page colour
around). Title `h1` "Create your account" / "Log in". Fields: Email
(`type=email`, `autocomplete`), Password (with a 44px eye toggle inside the
input's right edge; `autocomplete=new-password|current-password`). Sign-up
shows the hint "At least 10 characters" under the password field *before*
the user types. Inline errors appear on blur and on submit, under the field
in `error` state, with `aria-describedby`; focus moves to the first invalid
field on submit. Server 400 field errors map to the same inline slots. 409
on register and 401 on login render a danger callout above the fields with
the server's generic message — the UI never says whether the email exists.
Primary button full width, `loading` while submitting. Below the button a
`caption` row: "Already have an account? Log in" / "New here? Sign up" as a
quiet link. The card has no shadow; it sits flat on the page.

### 4.5 CV list

Route "My CVs". `h1` "My CVs" with "New CV" primary on the right (full width
under the title on mobile). Empty state is the designed case: left-aligned
on mobile, centred from 600px, no icon — `h2` "No CVs yet" carries it — body
copy from `empty_state.variants.cv_list`, "Start a CV" primary.
Populated: a single column of `card.list_row` (min 72px): title in
`body_strong` (falls back to target role when untitled), second line
`caption` "Target role · updated 28 Oct"; state badge right-aligned;
`generating` rows show the pulse dot badge and open straight into the
progress view. Rows are full-row links with a 44px minimum; "Delete" is a
danger_quiet button revealed on hover on desktop and always visible as the
one surviving icon, `trash`, with a 44px hit area on mobile, with a confirm callout inline
(not a modal). Loading shows three `skeleton` rows. Newest first, no
sorting UI.

## 5. Primitives — behaviour summary

| Primitive | Token block | Notes |
|---|---|---|
| Text input | `components.text_input` | 44px tall, label above, hint/error below; error = 2px red border + red caption; focus = accent border + ring |
| Textarea | `components.textarea` | autogrow, counter, 40vh cap on mobile |
| Inline field | `components.inline_field` | looks like text; dashed underline on hover; ring on focus; amber rule when it has a question; "edited by you" badge |
| Button | `components.button` | primary / secondary / quiet / danger_quiet; 44px; full width on mobile; loading keeps the label and locks width |
| Tab | `components.tab` | underline style, roving tabindex, arrow keys |
| Card / section | `components.card` | sheet, form, list_row variants; `section` for CV sections |
| Question | `components.question` | §3; states default / linked / answering / saving / answered / follow_up / skipped / error |
| Callout | `components.callout` | danger (role=alert) / info / success; the only place long error text lives |
| Source quote | `components.source_quote` | sunken block with rule; user-sourced = accent rule |
| Badge | `components.badge` | 22px pill, 14px text; CV state map |
| Progress stage | `components.progress_stage` | vertical → horizontal at 600px; pulse with reduced-motion fallback |
| Empty state | `components.empty_state` | three variants; no icon and no illustration — the heading carries it |
| Dropzone | `components.dropzone` | OS picker on mobile; hint names the limits |
| Sticky action bar | `components.sticky_action_bar` | mobile editor only; hides while an input has focus |
| Toast | `components.toast` | two uses only; role=status |

Universal states: every interactive element has a visible focus ring
(`shadows.focus` / `focus_on_page`), `:focus-visible` only; disabled is
`border.subtle` + `text.muted`, never opacity; hover is a background shift,
never a colour change of text alone.

## 6. Deliberately left out

- **Dark mode.** The CV is paper and the PDF is white; a dark editor would
  make the document lie about itself, and it doubles the QA surface for a
  first release. Tokens are structured so a `[data-theme="dark"]` block can
  override `colors.*` later without touching components.
- **Webfont.** See §2.2; the PDF embeds its own font, and a second font
  family on the web would drift from it anyway.
- **Percentage or time-remaining progress.** There is no truthful number;
  stage + elapsed time is what the server knows.
- **Icon package, illustration set, component library, CSS framework.** Not
  on the approved list.
- **Icons, almost entirely.** The first draft of this spec named 18. The
  Orchestrator cut the list to **one** — `trash`, on the CV-list row, where
  the control repeats per row and has no room for a label. Everything else
  became the text it was decorating: buttons say what they do, an input error
  is a red border plus a red caption, the answered state is the word
  "answered". The rule now lives in `design.json` → `icons.rule`, because a
  list like that regrows one reasonable-sounding icon at a time.
- **Modals.** Delete confirmation and conflicts are inline callouts; a modal
  on a 375px screen over a keyboard is the thing we are trying to avoid.
- **Rich text, drag-and-drop reordering, undo.** Out of spec (§3.6); reorder
  is Move up / Move down buttons, which also work with a keyboard.
- **Print stylesheet / WYSIWYG A4 preview.** Out of spec (§3.9); the sheet
  is a structured document, not a page preview, and says so nowhere — it
  simply does not paginate.
- **Marketing surfaces, onboarding tours, celebratory animation on
  completion.** The user is anxious; a quiet "Your draft is ready" badge
  state is the celebration.

## 7. What the web lane needs that tokens cannot express

- The ≥900px question alignment (`offsetTop` measurement + overlap push) is
  logic, not CSS; see §3. A `ResizeObserver` on the sheet is enough.
- The mobile sticky bar hiding on input focus, and
  `keyboard_safe_bottom_padding`, depend on `focusin`/`focusout` handlers.
- The "next unanswered question" jump uses server order, not DOM order.
- Elapsed-time counter starts from the job's `createdAt`, not from page
  load, so a reload shows the true duration.
- Prefer `100dvh` over `100vh` on mobile so the sticky bar is not pushed
  under the browser chrome.

## 8. Files

- `design.json` — tokens (this spec references them by path).
- `README.md` — this spec.
- `references/` — not used; there were no owner images on this project.
