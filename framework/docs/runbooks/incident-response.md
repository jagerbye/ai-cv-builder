# runbook: incident response

> **What this file is:** what to do when production misbehaves: triage order,
> where to look, who/what to involve, and the post-mortem routine that feeds
> `framework/knowledge/errors.md`. Written calm, used panicked — keep steps dumb-simple.
> **Who reads it:** whoever is on the incident, human or agent.

## Triage (in order)

1. **Scope:** what is broken, for whom, since when? (check monitoring/logs —
   fill in exact locations per project)
2. **Recent changes:** last deploy? last migration? (`git log`, deploy log)
3. **Mitigate first, diagnose second:** rollback (see deploy runbook) beats
   a live fix in production.

## During the incident

- Keep a timestamped log of observations and actions (a scratch file is
  fine) — it becomes the post-mortem input.
- Before "fixing" by restarting/deleting anything: verify evidence supports
  that exact action; pattern-matching a known failure can hide a new cause.

## After the incident (same day)

- Post-mortem, blameless, 10 lines max: timeline → root cause → fix →
  prevention.
- Prevention items become backlog tasks; the root-cause→fix pair becomes an
  entry in `framework/knowledge/errors.md` so no agent repeats it.
