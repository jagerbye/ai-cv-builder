#!/usr/bin/env bash
# wave.sh — owns the lifecycle of the wave marker framework/scripts/.wave-in-flight.
# While it exists, gate.config.sh judges a lane by its OWN tests (wave mode),
# hook-pretool.sh refuses all-inclusive `git add`, and FAST_CHECK stays quiet.
#
#   wave.sh start   Orchestrator, before the first lane of a wave starts.
#   wave.sh status  Which gate criterion applies right now.
#   wave.sh end     Integrator, after the last lane merged: removes the marker
#                   and runs the FULL gate (GATE_FULL=1), which must be green
#                   before the wave is reported done.
#
# The marker is local state, never committed: it is gitignored, `start`
# refuses to run if it is tracked, and a tree with the marker left behind
# would run the weak gate forever — so `end` is part of the wave, not optional.
set -u
cd "$(dirname "$0")/../.."
marker=framework/scripts/.wave-in-flight
case "${1:-}" in
  start)
    if git ls-files --error-unmatch "$marker" >/dev/null 2>&1; then
      echo "wave ✗ $marker is TRACKED — it must never be committed; git rm --cached it and gitignore it" >&2; exit 1
    fi
    git check-ignore -q "$marker" || echo "wave ! $marker is not gitignored — add it to .gitignore before committing anything" >&2
    [ -f "$marker" ] && { echo "wave: already in flight since $(cat "$marker")"; exit 0; }
    date -u +%Y-%m-%dT%H:%M:%SZ > "$marker"
    echo "wave ▶ in flight — gate is lane-scoped (lint + GATE_LANE_TEST); commit per task with explicit paths; run 'wave.sh end' when the Integrator has merged the last lane"
    ;;
  status)
    if [ -f "$marker" ]; then echo "wave: in flight since $(cat "$marker") — lane-scoped gate; GATE_FULL=1 gate.sh forces the union"
    else echo "wave: none — full gate applies"; fi
    ;;
  end)
    [ -f "$marker" ] || { echo "wave: no wave in flight"; exit 0; }
    rm -f "$marker"
    echo "wave ■ ended — running the FULL gate (the union is the Integrator's)"
    GATE_FULL=1 bash framework/scripts/gate.sh
    ;;
  *) echo "usage: wave.sh start|status|end" >&2; exit 2 ;;
esac
