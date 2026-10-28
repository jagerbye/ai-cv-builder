# integrations.md — Jira, Figma, and how keys are held

> **What this file is:** how the team plugs into external systems so it can
> run autonomously like a real company — and the containment rules that make
> that safe. The always-on summary lives in `rules/integrations.md`; this
> file is the setup and the detail.

## Keys — where they live

- Keys/tokens go into **MCP server configuration** (`.mcp.json` env refs →
  values in `.env` / OS keychain / CI secrets). Agents use the MCP *tools*;
  no agent ever sees, prints, copies or commits a raw key
  (rules/security.md; settings.json already denies reading `.env`).
- Scope keys minimally at creation: the Jira token to the one project, the
  Figma token to the one team/project, when the provider allows it. The
  rules below hold even when the key is technically broader.

## Config block (fill per project — agents verify against THIS)

```
jira:  { site: "<org>.atlassian.net", projectKey: "<KEY>" }
figma: { designatedProjectId: "<id>", designatedProjectName: "<name>" }
```

## Jira

- **Repo files remain the source of truth**; Jira is the mirror for humans
  and management. PM mirrors backlog items (B-NNN ↔ issue, ID recorded on
  the item), moves statuses at sprint close, files QA blockers.
- Agents create/update/comment issues ONLY in `projectKey` above. Reading
  other projects is allowed only when the owner points at a specific issue.
- Estimates/worklogs follow the owner's company conventions — ask once,
  record the answer here (daily caps, assignee, worklog format):
  `worklog conventions: <fill>`.
- Time tracking and the push→staging→QA→status flow: when each sync happens,
  who moves statuses (auto; critical tasks after owner's yes) — defined in
  `framework/process/task-lifecycle.md`; this file only holds the credentials/config.

## Figma — the containment rule (absolute)

- At setup, ONE Figma project is created (or designated by the owner) for
  this product; its ID goes in the config block above.
- Create / edit / delete: **only inside that project.** Before any
  destructive call, the agent verifies the target's project ID equals the
  designated one — no match, no call.
- Anything in a FOREIGN project — including "just reading" a company design
  system, and especially editing or deleting — requires the owner's explicit
  permission for that specific action, relayed through the Orchestrator and
  noted in the session's report. Another agent's say-so is not permission.
- Deleting the designated project itself, or mass-deleting its contents,
  also requires explicit owner confirmation (deploy-runbook logic: the
  rollback question comes BEFORE the destructive act).

## Degradation

MCP tool missing or key absent → the flow continues file-only (backlog.md,
design-tokens.json) and the Orchestrator tells the owner what to configure.
Integration is an amplifier, never a blocker.
