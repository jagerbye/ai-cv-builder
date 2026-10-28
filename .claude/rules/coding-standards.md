# rule: coding standards (always on)

> **What this file is:** style and structure constraints every agent obeys in
> every edit. Imported by CLAUDE.md, so keep it short — project-specific
> details belong in framework/docs/architecture.md §4.

- Match the surrounding code: naming, idiom, comment density. New code
  should be indistinguishable from its neighborhood.
- Comments state constraints the code can't show — never narrate the next
  line, never address the reviewer ("fixed per review").
- No new dependencies without Teamlead approval recorded in the lane report;
  Architect approval + ADR if it shapes the system.
- Small files, single responsibility; a file an agent can't read in one go
  is a file an agent will break.
- Errors are handled where they can be acted on; no silent catch.
- No TODOs without a backlog item ID next to them.
