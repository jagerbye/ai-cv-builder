#!/usr/bin/env bash
# gate.config.example.sh — copy to gate.config.sh (next to this file) and fill with the project's
# real commands. gate.config.sh is the ONE place "green" is defined
# (docs/testing-strategy.md §Commands points here).

# Full gate, run by scripts/gate.sh (Stop hook, CI, integrator, reviewer).
# Order: fail fast — cheapest checks first.
GATE_STEPS=(
  "typecheck:npx tsc --noEmit"
  "lint:npx eslint . --max-warnings 0"
  "test:npm test --silent"
  "build:npm run build --silent"
)

# Fast per-file check, run by the PostToolUse hook after every Edit/Write.
# Gets the edited file path as $1. Keep it <2s; empty string disables it.
FAST_CHECK='f(){ case "$1" in *.ts|*.tsx) npx tsc --noEmit ;; *.js) node --check "$1" ;; esac; }; f'
