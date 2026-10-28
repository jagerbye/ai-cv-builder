#!/usr/bin/env bash
# hook-postedit.sh — PostToolUse hook: fast feedback after every Edit/Write.
# Runs FAST_CHECK (from gate.config.sh) on the edited file; exit 2 feeds the
# failure back to the editing agent immediately, instead of discovering it at
# the gate. No config / no FAST_CHECK → silent no-op.
set -u
cd "$(dirname "$0")/../.."
[ -f framework/scripts/gate.config.sh ] || exit 0
source framework/scripts/gate.config.sh
[ -n "${FAST_CHECK:-}" ] || exit 0

file=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
[ -n "$file" ] || exit 0

if ! bash -c "$FAST_CHECK \"\$1\"" _ "$file" >&2; then
  echo "fast check failed for $file — fix before continuing" >&2
  exit 2
fi
