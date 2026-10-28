# errors.md — errors we already paid for

> **What this file is:** append-only log of non-obvious errors and their
> verified fixes. The point: an error is paid for ONCE. Agents grep this file
> by symptom keywords BEFORE debugging (the lane brief says which keywords);
> nobody reads it whole — that's why every entry starts with greppable
> symptom words.
> **Who writes it:** `/retro` moves candidates here from lane reports; an
> agent may append directly when the fix is verified.

Format — newest on top:

```
## E-NNN <symptom keywords, exact error text fragment>  (YYYY-MM-DD)
- **Context:** where it happened (component, operation).
- **Root cause:** one–two sentences, the real cause, not the first guess.
- **Fix:** what actually worked.
- **Prevention:** rule/check that makes it impossible — if it changed a rule
  file or the playbook, link it.
```

Rules: one entry per distinct root cause; a repeat of an existing entry means
its Prevention line failed — improve the prevention, don't duplicate the
entry.

---

## E-001 union test run red while parallel lanes in flight (missing-module / foreign-suite failures)  (2026-10-23)

- **Context:** several Mode-A lanes on one tree; a lane brief told the agent
  to run the bare test command, which executes the UNION of all suites.
- **Root cause:** during parallel execution the union is red by design (a
  sibling lane's tests exist before its code). The brief, not the code, is
  defective — agents waste a step diagnosing a foreign failure.
- **Fix:** execution-phase runs are lane-scoped (run only the lane's own
  test files); the union is run only by the Integrator and the Stop-hook
  gate after lanes land.
- **Prevention:** sprint-playbook §2 brief template names the exact
  lane-scoped test command; §3 wording says "lane test run", union only in §4.

## prisma / docker / migration (T-02)
- Never redirect `prisma ... > migration.sql` with 2>&1: the "Update available" banner lands in the SQL. Set PRISMA_HIDE_UPDATE_MESSAGE=1 and check the file head.
- node:*-slim images lack OpenSSL; install openssl in the Dockerfile before `prisma generate`/`migrate deploy`.
- Compiled api is ESM without extensions: relative imports in api/src need `.js` specifiers (or NodeNext) or `node dist/main.js` fails.
- A test helper that mutates process.env must restore it; a "DB down" case leaks into later "DB up" cases and looks like a missing database.
- "Needs Docker" is not a diagnosis: start the daemon (`open -a Docker`) and run the smoke before reporting red.
