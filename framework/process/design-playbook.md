# design-playbook.md — image → tokens → Figma → code

> **What this file is:** the design pipeline. The source of truth for design
> is a MACHINE-READABLE tokens file in the repo (`framework/docs/design/`), not Figma:
> code consumes the tokens directly, Figma mirrors them for humans. That
> order matters — a Figma-first flow leaves agents guessing hex codes off
> screenshots forever.

## Inputs

Either an **image** from the owner (mockup, screenshot, competitor page,
moodboard — the Orchestrator ASKS for one when the owner mentions a look
they like) or no image — then the designer proposes 2–3 directions from
`framework/docs/product/vision.md` and the owner picks.

## Stage 0 — Assert the token file's state (every lane, before trusting it)

The template ships `framework/docs/design/design.json` as a **skeleton**:
every value `""`, `meta.status` beginning with `UNFILLED`. The danger is not
an empty file — an empty value fails loud. The danger is a **filled file from
somewhere else**: an example, a previous product, a copied repo. Its values
are obeyed confidently and nothing signals they are wrong. So no lane reads
the file on trust; it asserts the state it expects, mechanically:

```bash
jq -r '.meta.status, .meta.product' framework/docs/design/design.json \
  || grep -E '"(status|product)":' framework/docs/design/design.json
```

| Lane | Expects | Otherwise |
|---|---|---|
| **Design lane (Stage 1)** | `meta.status` starts with `UNFILLED` **and** every token value is `""` | Values present and `meta.product` is THIS product → it is a redesign, not an extraction: go to *Change flow* (tokens are versioned, not re-derived). Values present and `meta.product` is empty or another name → the file is foreign: do **not** read a single value from it, reset it to the skeleton from `framework/docs/design/README.md`, record the finding in the design report, then extract. |
| **UI / frontend lane (Stage 3)** | `meta.status == "filled"` **and** `meta.product` names this product | Stop. `blockedOn: decision`, message "design.json is `<status>` for `<product>`; run /design" — a defective brief, not a reason to invent values or to style from the reference image. |
| **Reviewer of a UI lane** | The lane report quotes the assertion's output | Report lacks it → fix-list item; a UI diff whose tokens cannot be traced to a `filled` file is returned regardless of how it looks. |

The assertion is cheap and the failure it prevents is a whole UI built in
another product's clothes — a lane that skipped it and "happened to be right"
still failed the check.

*In this repository* the token file is `framework/docs/design/design.json`
(the template later renamed it `design-tokens.json`), filled for
`meta.product: "AI CV Builder"` and written before the `meta.status` flag
existed — so the Stage-3 assertion here is `meta.product`, and the skeleton
rule above describes the template, not this file. The finding that produced
Stage 0 is FF-03 in `framework/knowledge/framework-feedback.md`.

## Stage 1 — Extract (designer agent, reads the image)

- First: Stage 0, design-lane row. Only an asserted skeleton gets filled.

- `framework/docs/design/design.json`: palette (with dark-mode variants),
  typography scale, spacing scale, radii, shadows, breakpoints — format in
  `framework/docs/design/README.md`. Named tokens, no orphan hex values.
  Finish by setting `meta.status: "filled"`, `meta.product` to this product
  and `meta.updated` to today — that is the flag Stage 3 asserts; a filled
  file still marked UNFILLED blocks every UI lane.
- `framework/docs/design/design-spec.md`: component inventory (buttons, inputs,
  selects, cards… with their states), layout principles, what was
  deliberately NOT copied from the reference image (and why).
- Owner reviews a one-screen sample render before anything is mass-produced.

## Stage 2 — Figma templates (designer agent, Figma MCP)

- Work ONLY inside the product's designated Figma project — the scoping
  rules in `rules/integrations.md` are absolute (create/edit/delete inside
  it; anything outside → stop and ask the owner).
- Build: token styles/variables first, then components, then screen
  templates for the MVP flows. Templates follow the tokens file; a
  divergence found later is a bug in Figma, not in the tokens.

## Stage 3 — Handoff

- Frontend lanes consume `design.json` directly (CSS variables /
  theme config) — a lane brief points at tokens + the relevant design-spec
  section, never at "look at the Figma". The lane's first command is the
  Stage 0 assertion (UI-lane row) and its output goes in the lane report.
- QA's visual pass (`framework/process/qa-playbook.md`) checks rendered pages against
  `design-spec.md` — that file is the yardstick for "съехал/не съехал".

## Change flow

Design change requests: tokens/spec updated FIRST (docs-sync rule), then
Figma, then code via the normal task flow. Owner-visible redesigns get an
ADR.
