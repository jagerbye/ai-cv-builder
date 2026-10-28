#!/usr/bin/env bash
# gate.config.sh — THE definition of "green" for ai-cv-builder.
# Used identically by the Stop hook, CI, the Integrator and humans.
# docs/testing-strategy.md §Commands points here.

# Full gate. Order: fail fast — cheapest checks first.
GATE_STEPS=(
  "typecheck:npm run -s typecheck"
  "lint:npm run -s lint"
  "test:npm run -s test"
  "build:npm run -s build"
)

# Fast per-file check, run by the PostToolUse hook after every Edit/Write.
# Gets the edited file path as $1. Keep it <2s; empty string disables it.
# Silent no-op until the toolchain is installed, so T-01 can bootstrap the
# repo without every write being blocked by a compiler that isn't there yet.
FAST_CHECK='f(){ [ -x node_modules/.bin/tsc ] || return 0; case "$1" in *.ts|*.tsx) node_modules/.bin/tsc --noEmit -p tsconfig.json ;; esac; }; f'
