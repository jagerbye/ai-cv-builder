# qa-playbook.md — manual QA through a real browser

> **What this file is:** the final quality stage. Gates catch red tests; they
> do NOT catch a select that overflows its container on a phone. A QA agent
> drives a real browser (Playwright MCP plugin, or the claude-in-chrome
> tools) against the running site — local or remote — and tests like a
> careful human: flows AND design. Findings route to the cheap hotfix loop
> (`/hotfix`), not back through the full sprint machinery.

## Why this stage exists — and why it must not be the first look

A fully green gate can ship a product nobody can open. Server suites call
handlers in-process; client suites mock the transport; both are correct at
their level, and the seam between them — a browser, a web server, a service
reached over a network — is the one thing neither instantiates. In the first
project run on this framework that seam was missing entirely (no route from
the served client to the service), and nearly seven hundred green tests,
sixty-six reviews and two integration passes could not see it. The manual
pass found it in minutes. **That is the case for this stage.**

It is also the case against relying on it: the defect entered in the first
wave and was found at stage 4.5 of the second. Everything built in between
assumed a seam that did not exist. So the product is opened earlier as well,
by rule: the bootstrap task (sprint-playbook.md §1 — first and blocking)
starts the stack as it will run, drives one request end to end through
every boundary `architecture.md` names, makes one real call to every
external dependency, and fills the smoke variables so the gate can repeat
the check; the full gate carries that smoke step, which drives
the composed stack over the real transport (it never runs under the wave
marker, so it runs at `wave.sh end` and in CI); and `architecture.md` names
who owns the seam. QA is the last net, not the only one.

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
- **Port conflicts: move your own port, never free someone else's.** On a
  developer machine a busy default port usually belongs to work you cannot
  see — another project's dev server, up for weeks. No agent kills a process
  or "frees a port" it did not start. Report the conflict, start on another
  port (host ports are env-overridable for exactly this reason), and QA
  against that. A fix-list item that says "free the port" is itself a defect.

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
