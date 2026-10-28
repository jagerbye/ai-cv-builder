#!/usr/bin/env bash
# check-lane.sh — mechanical lane-isolation check (merge-policy.md rule).
# The diff against <base-ref> may only touch paths matching the allowlist.
# Reviewer runs it per lane; Integrator runs it before merging a lane.
#
# Usage: scripts/check-lane.sh <base-ref> <allowlist-file>
# Allowlist: one shell glob per line ('*' matches '/' too, so `src/slug/*`
# covers the whole subtree); blank lines and #comments ignored.
set -u
base="${1:?usage: check-lane.sh <base-ref> <allowlist-file>}"
list="${2:?usage: check-lane.sh <base-ref> <allowlist-file>}"
cd "$(dirname "$0")/../.."

status=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  ok=0
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    case "$pat" in \#*) continue ;; esac
    # shellcheck disable=SC2254
    case "$f" in $pat) ok=1; break ;; esac
  done < "$list"
  if [ $ok -eq 0 ]; then
    echo "lane ✗ violation: $f (not in $list)" >&2
    status=1
  fi
done < <(git diff --name-only "$base")

[ $status -eq 0 ] && echo "lane ✓ diff stays inside the allowlist"
exit $status
