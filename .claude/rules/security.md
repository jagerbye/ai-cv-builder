# rule: security (always on)

> **What this file is:** the always-on security constraints for every agent,
> every edit. Project-specific threat model belongs in framework/docs/architecture.md.

- No secrets in code, docs, lane reports, or commits — ever. Secrets live in
  env/secret stores; `.env*` is gitignored. Never print a secret's value.
- Validate at every trust boundary: anything from a user, another service,
  or a file is untrusted until parsed/validated.
- Parameterized queries only; no string-built SQL/shell from input.
- AuthZ is checked server-side per request, never only in the UI.
- Dependencies: pin versions; a new dependency gets a one-line risk note in
  the lane report.
- **Delete only what you can name.** Any destructive operation — rows,
  files, records in an external system — targets the ids collected while
  creating them, never a prefix, a name pattern, a time window or a count.
  A shared database, a shared machine and a shared workspace hold other
  people's work, and the damage is invisible to the agent that does it. A
  one-off probe typed at a prompt is held to this exactly as committed code.
- **Never kill a process or free a port you did not start.** A busy port on
  a developer machine belongs to work you cannot see; report the conflict
  and move your own port.
- An agent that finds a vulnerability stops the task and reports it to the
  Orchestrator before anything else — it does not quietly patch around it.
