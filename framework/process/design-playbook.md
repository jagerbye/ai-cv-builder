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

## Stage 1 — Extract (designer agent, reads the image)

- `framework/docs/design/design-tokens.json`: palette (with dark-mode variants),
  typography scale, spacing scale, radii, shadows, breakpoints — format in
  `framework/docs/design/README.md`. Named tokens, no orphan hex values.
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

- Frontend lanes consume `design-tokens.json` directly (CSS variables /
  theme config) — a lane brief points at tokens + the relevant design-spec
  section, never at "look at the Figma".
- QA's visual pass (`framework/process/qa-playbook.md`) checks rendered pages against
  `design-spec.md` — that file is the yardstick for "съехал/не съехал".

## Change flow

Design change requests: tokens/spec updated FIRST (docs-sync rule), then
Figma, then code via the normal task flow. Owner-visible redesigns get an
ADR.
