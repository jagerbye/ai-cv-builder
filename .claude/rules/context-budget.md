# rule: context budget (always on)

> **What this file is:** the economy rule. Tokens are the project's fuel;
> most waste is reading things "for context". The router (CLAUDE.md) and the
> briefs exist so nobody has to explore.

- Read what your brief/routing-table names. Need more → that's a defective
  brief: report it, don't wander the repo.
- Grep before Read; section before file; file before directory. Never read
  `node_modules`, lockfiles, build output, or a whole docs tree.
- Don't paste file contents into sub-agent prompts — pass paths.
- Don't re-read files you just wrote; don't re-run green checks to
  "make sure".
- Findings that outlive the session go to the designated file immediately;
  chat is not storage.
- Orchestrator-specific: you read plans and reports, never source. Wanting
  to read source means a report failed — fix the report format instead.
- State goes to STATE.md the moment it exists, not to chat memory; briefs
  cap agent reports ("report ≤30 lines"); multi-file questions are
  delegated to a search agent that returns a conclusion, not dumps.
