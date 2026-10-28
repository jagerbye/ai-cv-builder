#!/usr/bin/env bash
# hook-stop.sh — Stop hook: the full gate must be green before a turn ends.
# A red gate blocks the stop (exit 2) and hands the failure back to the
# agent. stop_hook_active guard prevents an infinite block loop: the agent
# gets exactly one forced attempt to fix the gate per turn.
set -u
cd "$(dirname "$0")/../.."
input=$(cat)
printf '%s' "$input" | grep -q '"stop_hook_active": *true' && exit 0
if ! bash framework/scripts/gate.sh >&2; then
  echo "gate is RED — fix it or report the failure explicitly; do not end silently" >&2
  exit 2
fi
