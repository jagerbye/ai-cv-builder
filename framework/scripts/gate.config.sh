#!/usr/bin/env bash
# gate.config.sh — THE definition of "green" for ai-cv-builder.
# Used identically by the Stop hook, CI, the Integrator and humans.
# docs/testing-strategy.md §Commands points here.

# Full gate. Order: fail fast — cheapest checks first.
# The api tests hit a real Postgres. Locally the gate starts the compose db and
# waits for it to be healthy; CI provides a postgres:16 service instead
# (.github/workflows/ci.yml sets CI=true).
GATE_DB_UP='[ -n "${CI:-}" ] || docker compose up -d --wait db'
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/ai_cv_builder}"

GATE_STEPS=(
  "database:${GATE_DB_UP}"
  "typecheck:npm run -s typecheck"
  "lint:npm run -s lint"
  "test:npm run -s test"
  "build:npm run -s build"
)

# Fast per-file check, run by the PostToolUse hook after every Edit/Write.
# Gets the edited file path as $1. Keep it <2s; empty string disables it.
# Silent no-op until the toolchain is installed, so T-01 can bootstrap the
# repo without every write being blocked by a compiler that isn't there yet.
# Typechecks the workspace that owns the edited file (no root tsconfig needed).
FAST_CHECK='f(){ [ -x node_modules/.bin/tsc ] || return 0; case "$1" in *api/*.ts|*api/*.tsx) node_modules/.bin/tsc --noEmit -p api/tsconfig.json ;; *web/*.ts|*web/*.tsx) node_modules/.bin/tsc --noEmit -p web/tsconfig.json ;; esac; }; f'
