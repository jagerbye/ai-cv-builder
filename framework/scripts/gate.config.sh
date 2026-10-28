#!/usr/bin/env bash
# gate.config.sh — THE definition of "green" for ai-cv-builder.
# Used identically by the Stop hook, CI, the Integrator and humans.
# docs/testing-strategy.md §Commands points here.

export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/ai_cv_builder}"

GATE_DB_UP='docker compose ps --status running --format "{{.Service}}" | grep -qx db || docker compose up -d --wait db'

# --- Wave mode (knowledge/errors.md E-001) -----------------------------------
# While parallel lanes share one tree, the UNION of typecheck/test/build is red
# BY DESIGN: a sibling lane's tests exist before its implementation does, and
# tests come first by rule. Judging a lane by the union therefore fails every
# lane for its neighbours' half-finished work — and no model, however strong,
# can fix another lane's missing file from inside its own.
#
# So while `.wave-in-flight` exists, "green" for a lane is: lint (it does not
# resolve across modules) plus that lane's OWN tests, passed in GATE_LANE_TEST.
# The union belongs to the Integrator, who runs it with GATE_FULL=1 after each
# merge — exactly what E-001 prescribes.
if [ -f framework/scripts/.wave-in-flight ] && [ -z "${GATE_FULL:-}" ]; then
  GATE_STEPS=( "database:${GATE_DB_UP}" "lint:npm run -s lint" )
  [ -n "${GATE_LANE_TEST:-}" ] && GATE_STEPS+=( "lane-test:${GATE_LANE_TEST}" )
  echo "gate: wave in flight — lane-scoped (lint${GATE_LANE_TEST:+ + lane tests}); the union is the Integrator's, see errors.md E-001" >&2
else
  GATE_STEPS=(
    "database:${GATE_DB_UP}"
    "typecheck:npm run -s typecheck"
    "lint:npm run -s lint"
    "test:npm run -s test"
    "build:npm run -s build"
  )
fi

# Fast per-file check, run by the PostToolUse hook after every Edit/Write.
# Silent no-op until the toolchain exists, and during a wave: a cross-lane
# type error is not the editing agent's to fix.
FAST_CHECK='f(){ [ -x node_modules/.bin/tsc ] || return 0; [ -f framework/scripts/.wave-in-flight ] && return 0; case "$1" in *.ts|*.tsx) node_modules/.bin/tsc --noEmit -p "$(cd "$(dirname "$1")" && git rev-parse --show-prefix | cut -d/ -f1)/tsconfig.json" 2>/dev/null || true ;; esac; }; f'
