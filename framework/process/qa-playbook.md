# qa-playbook.md — manual QA through a real browser

> **What this file is:** the final quality stage. Gates catch red tests; they
> do NOT catch a select that overflows its container on a phone. A QA agent
> drives a real browser (Playwright MCP plugin, or the claude-in-chrome
> tools) against the running site — local or remote — and tests like a
> careful human: flows AND design. Findings route to the cheap hotfix loop
> (`/hotfix`), not back through the full sprint machinery.

## When it runs

- **Sprint stage 4.5:** after integration, before the sprint closes — on the
  pages/flows the sprint touched plus a short smoke of the rest.
- **On demand:** `/qa <url or env> [scope]` any time (after a deploy, before
  a demo, on an owner complaint).

## Target and tooling

- URL comes from the deploy runbook's env table (`framework/docs/runbooks/deploy.md`)
  or the owner; local runs start the app per
  `framework/docs/runbooks/local-development.md` first.
- Browser control: the Playwright MCP plugin if installed, else
  claude-in-chrome tools. The QA agent takes SCREENSHOTS and reads them —
  design verdicts come from looking, not from the DOM alone.

## The pass (per page/flow in scope)

1. **Functional:** walk the real user flow (fill inputs, submit, navigate,
   trigger validation errors on purpose). Check outcomes, not just absence
   of crashes. Watch the console and failed network requests throughout.
2. **Visual — desktop (1440×900) and mobile (375×812; add 768×1024 when the
   layout has a tablet breakpoint):** screenshot each state and inspect:
   - nothing overflows, overlaps or escapes its container; no horizontal
     page scroll on mobile;
   - inputs/selects/buttons aligned with their labels, consistent heights,
     not clipped; dropdowns open fully and stay on-screen;
   - typography and spacing consistent with the rest of the site (and with
     `framework/docs/` design references when the project has them);
   - interactive states visible (focus, hover, disabled, error), touch
     targets usable on mobile;
   - images not stretched; empty/long-content states don't break the grid
     (test with a long string in at least one field).
3. **Evidence:** every finding gets a repro (URL, viewport, steps) and a
   screenshot path. No screenshot → not a finding, it's an opinion.

## Report → fix

- Findings go to `framework/sprints/<sprint>/qa-report.md` (template in
  `SPRINT-000-template/`), severity-triaged:
  - **blocker** (flow broken, data loss) → back to the owning lane through
    the sprint machinery; the sprint cannot close over an open blocker;
  - **major / minor / visual** → `/hotfix` loop: cheap, fast, still gated.
- After fixes, QA re-checks ONLY the fixed screens/viewports and flips each
  finding's status; the report is the log of record.
- A finding whose root cause is non-obvious also becomes an E-NNN in
  `framework/knowledge/errors.md`; a recurring visual defect class becomes a line in
  this playbook's checklist so the next pass catches it by default.
