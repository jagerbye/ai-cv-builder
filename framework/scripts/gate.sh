#!/usr/bin/env bash
# gate.sh — THE verification gate. Hooks, CI, agents and humans all call this
# script, so "green" means the same thing everywhere. Steps are defined per
# project in gate.config.sh (array GATE_STEPS of "name:command"); that file
# picks a lane-scoped set while a wave is in flight (see wave.sh).
# No config yet → template mode: warn and pass, so the framework is usable
# before a project exists.
set -u
# cd to the PROJECT root (two levels up: framework/scripts/ → root), so
# GATE_STEPS commands run where the project's code lives.
cd "$(dirname "$0")/../.."

if [ ! -f framework/scripts/gate.config.sh ]; then
  echo "gate: framework/scripts/gate.config.sh missing — template mode, nothing enforced yet." >&2
  exit 0
fi

# shellcheck source=gate.config.sh
source framework/scripts/gate.config.sh

# Say which criterion is being applied: a wave-mode pass is a LANE pass, and a
# reader of the log must not mistake it for the union (wave.sh, gate.config).
if [ -f framework/scripts/.wave-in-flight ] && [ -z "${GATE_FULL:-}" ]; then
  echo "gate: wave in flight — lane-scoped gate${GATE_LANE_TEST:+ (lane tests: $GATE_LANE_TEST)}; the union is the Integrator's (GATE_FULL=1)" >&2
fi

status=0
for step in "${GATE_STEPS[@]}"; do
  name="${step%%:*}"
  cmd="${step#*:}"
  echo "gate ▶ ${name}"
  if ! bash -c "$cmd"; then
    echo "gate ✗ ${name} FAILED" >&2
    status=1
  fi
done

if [ $status -eq 0 ]; then
  echo "gate ✓ all green"
else
  echo "gate ✗ RED — nothing merges, the turn should not end silently" >&2
fi
exit $status
