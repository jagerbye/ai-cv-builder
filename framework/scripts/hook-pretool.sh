#!/usr/bin/env bash
# hook-pretool.sh — PreToolUse hook on Bash: while a wave is in flight, refuse
# an all-inclusive stage or commit. The tree then holds OTHER lanes' finished,
# uncommitted work by design, so `git add -A` / `git add .` / `git commit -a`
# — the first command anyone reaches for — silently sweeps five lanes into a
# commit whose message names one. Commit per task with explicit paths or
# `git add --pathspec-from-file=<lane allowlist>` instead. Exit 2 blocks the
# call and hands the reason back to the agent. No wave → no-op.
set -u
cd "$(dirname "$0")/../.."
[ -f framework/scripts/.wave-in-flight ] || exit 0
cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null)
[ -n "$cmd" ] || exit 0
if printf '%s' "$cmd" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+(add[[:space:]]+(-A|--all|-u|--update|\.|:/|\*)([[:space:]]|$)|add([[:space:]]+-[^[:space:]]+)*[[:space:]]+(-A|--all|\.)([[:space:]]|$)|commit[[:space:]]+(-[a-zA-Z]*a[a-zA-Z]*|--all)([[:space:]]|$))'; then
  echo "wave in flight: all-inclusive 'git add'/'git commit -a' refused — the tree holds other lanes' work. Stage this task's files explicitly (git add <paths> or --pathspec-from-file=<lane allowlist>), one commit per task. See framework/scripts/wave.sh." >&2
  exit 2
fi
exit 0
