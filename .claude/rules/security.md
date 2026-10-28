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
- An agent that finds a vulnerability stops the task and reports it to the
  Orchestrator before anything else — it does not quietly patch around it.
