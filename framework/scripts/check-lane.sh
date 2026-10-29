#!/usr/bin/env bash
# check-lane.sh — mechanical lane-isolation check (merge-policy.md rule).
# Everything a lane changed since <base-ref> must match its allowlist.
# Reviewer runs it per lane; Integrator runs it before merging a lane.
#
# Usage: check-lane.sh <base-ref> <glob> [<glob>...]      globs on the command line
#        check-lane.sh <base-ref> -f <allowlist-file>      one glob per line
# Globs are shell patterns; '*' matches '/' too, so `src/slug/*` covers the
# whole subtree. In a file, blank lines and #comments are ignored. Quote globs
# on the command line so the shell does not expand them first.
#
# Scope: changed TRACKED files since <base-ref> PLUS untracked files. The
# untracked half matters: in a young project most of a lane's work is new
# files, and a check that only reads `git diff` validates nothing while
# reporting success.
#
# Why two forms: plans and briefs describe a lane's area as a list of globs,
# and an earlier version took only a file — so agents passed the globs, the
# script tried to read a file named after them, and every change, including
# the lane's own, came back as a violation. A missing allowlist file is now a
# loud error, never an empty allowlist.
set -u
usage="usage: check-lane.sh <base-ref> <glob>... | check-lane.sh <base-ref> -f <allowlist-file>"
base="${1:?$usage}"; shift
[ $# -ge 1 ] || { echo "$usage" >&2; exit 2; }
cd "$(dirname "$0")/../.."

pats=()
if [ "$1" = "-f" ]; then
  list="${2:?$usage}"
  [ -f "$list" ] || { echo "lane ✗ allowlist file not found: $list (pass globs directly, or -f <existing file>)" >&2; exit 2; }
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    case "$pat" in \#*) continue ;; esac
    pats+=("$pat")
  done < "$list"
  src="$list"
else
  pats=("$@")
  src="the given globs"
fi
[ ${#pats[@]} -ge 1 ] || { echo "lane ✗ allowlist is empty ($src) — nothing could pass" >&2; exit 2; }

status=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  ok=0
  for pat in "${pats[@]}"; do
    # shellcheck disable=SC2254
    case "$f" in $pat) ok=1; break ;; esac
  done
  if [ $ok -eq 0 ]; then
    echo "lane ✗ violation: $f (not in $src)" >&2
    status=1
  fi
done < <({ git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u)

[ $status -eq 0 ] && echo "lane ✓ changed + untracked files stay inside the allowlist"
exit $status
