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
FAST_CHECK='f(){ case "$1" in *.ts|*.tsx) npx tsc --noEmit -p "$(dirname "$1")/../tsconfig.json" 2>/dev/null || npx tsc --noEmit ;; *.sql) :; ;; esac; }; f'
