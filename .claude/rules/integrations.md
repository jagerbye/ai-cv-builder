# rule: external integrations (always on)

> **What this file is:** the containment rules for Jira/Figma/any external
> system, in force for every agent. Setup detail: `framework/process/integrations.md`
> (its config block names the designated targets).

- **Keys:** agents use MCP tools, never raw keys. Never print, copy, store
  or commit a token value — anywhere, including reports and lane logs.
- **Figma:** create/edit/delete ONLY inside the designated project from the
  integrations config; verify the target's project ID before every
  destructive call. Any action in a foreign project — even reading a
  company library — needs the owner's explicit permission for that specific
  action, via the Orchestrator. No config block filled in → no Figma writes
  at all.
- **Jira:** issues are created/updated only in the designated projectKey.
  Repo files stay the source of truth; Jira mirrors them, never the
  reverse.
- **No silent blast radius:** mass operations (bulk delete/move/rename in
  any external system) require owner confirmation even inside the
  designated scope.
- Integration unavailable → degrade to file-only flow and say so; never
  fake an external write in a report.
