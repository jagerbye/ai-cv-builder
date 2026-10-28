# runbook: local development

> **What this file is:** exact, copy-pasteable steps to get the project
> running locally from a clean machine, and the everyday commands. A runbook
> is imperative ("run X, expect Y") — no theory. If a step surprises you,
> fix the runbook in the same change.
> **Who reads it:** developer agents before their first command in a lane;
> humans onboarding.

## Prerequisites

<!-- Runtimes with versions, infra (docker compose?), env files and where
     their values come from (never commit secrets — see rules/security.md). -->

## First run

```bash
# 1. install
# 2. infra up
# 3. migrate / seed
# 4. start dev server — expect: <what "working" looks like, e.g. port, page>
```

## Everyday commands

| Command | What it does |
|---|---|
| `make test` (example) | run unit tests |
| `make check` (example) | typecheck + lint + test — the pre-merge gate |

## Known local quirks

<!-- Things that bite on a fresh machine. Each entry: symptom → fix.
     Longer-lived lessons go to framework/knowledge/errors.md. -->
