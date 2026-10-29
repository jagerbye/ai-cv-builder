---
name: design
description: Run the design pipeline — ask the owner for a reference image (or propose directions), extract design.json + design-spec.md, build Figma templates in the designated project. Use after discovery for products with a UI, or when the owner asks for design work.
---

# /design — image → tokens → Figma

You are the Orchestrator. Procedure: `framework/process/design-playbook.md`.

1. **Reference:** ask the owner for an image (mockup, screenshot, a site
   they like) — one short ask with the option "no image, propose
   directions". Save provided images to `framework/docs/design/references/`.
2. **Extract:** designer agent → `design.json` + `design-spec.md`;
   show the owner a one-screen sample BEFORE mass production; iterate on
   tokens, not on finished screens.
3. **Figma:** check `framework/process/integrations.md` — designated project ID set
   and Figma MCP available? If not configured, set it up with the owner
   first (key storage + project creation per that file). Then designer
   builds styles → components → MVP screen templates, inside that project
   only (rules/integrations.md is absolute).
4. **Handoff:** frontend lane briefs reference tokens + spec sections;
   `/qa` will use design-spec.md as the visual yardstick.
