#!/usr/bin/env bash
# record.sh — capture ONE real exchange with an external dependency as the
# reference fixture every mock of that dependency is derived from
# (rules/testing.md "recorded, not written"; docs/testing-strategy.md §Fixtures).
# Owner of the capture: the test-engineer, as the first deliverable of any
# task that mocks a dependency with no recording yet. The reviewer runs the
# --scan form on every recorded file before it lands.
#
#   record.sh <dependency> <case>      capture →
#       tests/fixtures/recorded/<dependency>/<YYYY-MM-DD>-<case>.<ext>
#       plus a sidecar <same name>.request.txt (the request that produced it,
#       the status, the timebox-relevant date) so the capture can be re-taken.
#   record.sh --scan <file>...         exit 1 if any file looks like it holds
#                                      a credential (same check the capture runs)
#
# The exchange comes from the environment, never from arguments (arguments
# land in shell history and lane logs):
#   RECORD_URL         curl target. RECORD_CURL_ARGS: extra curl args, e.g.
#                      '-H "authorization: Bearer $API_KEY" -d @req.json'
#   RECORD_CMD         alternative: a command whose stdout is the response
#                      (a CLI, an SDK one-liner, a webhook replay)
#   RECORD_EXT         file extension (default json)
#   RECORD_SECRET_VARS space-separated names of env vars whose VALUES are
#                      stripped from the output. Default: every exported var
#                      whose name contains KEY, TOKEN, SECRET, PASSWORD, PASSWD,
#                      COOKIE or SESSION (the names rules/security.md means).
#
# What it strips, and what it refuses:
#   - it strips only literal occurrences of known secret values (exact string
#     match) and the values of credential-shaped request headers / query
#     parameters in the sidecar. It does NOT guess at secrets inside the body:
#     a redaction heuristic that rewrites response text produces a fixture
#     that is no longer a recording.
#   - after stripping, it scans the result for anything credential-shaped
#     (bearer/JWT/private-key/known token prefixes/`"api_key": "..."`-style
#     fields) and REFUSES to write when it finds one. The remedy is a test
#     account, a narrower request or RECORD_SECRET_VARS — never editing the
#     file by hand after the fact (git keeps the first version).
#   - it never overwrites: a re-take is a new dated file (same day → new case).
set -u
cd "$(dirname "$0")/../.."
ROOT=tests/fixtures/recorded

fail() { echo "record ✗ $1" >&2; exit 1; }

# Credential-shaped content. Extended regex, one alternative per line; a hit
# anywhere in a file is a refusal. Extend per project, never shorten.
CRED_RE='[Bb]earer +[A-Za-z0-9._~+/=-]{16,}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|(sk|rk|pk)[-_](live|test|proj|ant|or)?[-_]?[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|"(access_token|refresh_token|id_token|api[_-]?key|apikey|secret|client_secret|password|passwd|session[_-]?id|authorization)" *: *"[^"]{6,}"|[Ss]et-[Cc]ookie:|(api[_-]?key|access_token|token|secret|password)=[A-Za-z0-9._~%+/=-]{8,}'

scan() {  # scan <file> → 0 clean, 1 hit (prints the hit, value elided)
  local f="$1" hits
  hits=$(grep -nE -o "$CRED_RE" "$f" 2>/dev/null) || return 0
  echo "record ✗ credential-shaped content in $f (line:first chars):" >&2
  printf '%s\n' "$hits" | cut -c1-40 | sed 's/^/   /; s/$/…/' | head -5 >&2
  return 1
}

if [ "${1:-}" = "--scan" ]; then
  shift; [ $# -gt 0 ] || fail "usage: record.sh --scan <file>..."
  rc=0; for f in "$@"; do [ -f "$f" ] || fail "no such file: $f"; scan "$f" || rc=1; done
  [ $rc = 0 ] && echo "record ✓ no credential-shaped content in $# file(s)"
  exit $rc
fi

[ $# = 2 ] || fail "usage: record.sh <dependency> <case>   (RECORD_URL or RECORD_CMD in the environment) | record.sh --scan <file>..."
dep="$1"; case_="$2"
case "$dep$case_" in *[!A-Za-z0-9._-]*) fail "dependency and case are path segments: letters, digits, . _ - only" ;; esac
[ -n "${RECORD_URL:-}${RECORD_CMD:-}" ] || fail "set RECORD_URL (curl) or RECORD_CMD (stdout is the response)"
[ -n "${RECORD_URL:-}" ] && [ -n "${RECORD_CMD:-}" ] && fail "set RECORD_URL or RECORD_CMD, not both"

ext="${RECORD_EXT:-json}"; day=$(date +%F)
dir="$ROOT/$dep"; out="$dir/$day-$case_.$ext"; side="$dir/$day-$case_.request.txt"
[ -e "$out" ] && fail "$out exists — recordings are never overwritten; use a new case name"

tmp=$(mktemp); tmpside=$(mktemp); trap 'rm -f "$tmp" "$tmpside"' EXIT

# 1. the exchange
status=
if [ -n "${RECORD_URL:-}" ]; then
  command -v curl >/dev/null || fail "curl not found"
  # shellcheck disable=SC2086
  status=$(eval "curl -sS -m 60 -o \"\$tmp\" -w '%{http_code}' ${RECORD_CURL_ARGS:-} \"\$RECORD_URL\"") || fail "curl failed (${status:-no status})"
  request="curl ${RECORD_CURL_ARGS:-} $RECORD_URL"
else
  bash -c "$RECORD_CMD" >"$tmp" || fail "RECORD_CMD exited non-zero"
  request="$RECORD_CMD"
fi
[ -s "$tmp" ] || fail "empty response — nothing to record"

# 2. strip known secret VALUES (literal match only) from body and request line
if [ -n "${RECORD_SECRET_VARS:-}" ]; then names="$RECORD_SECRET_VARS"
else names=$(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' | grep -E 'KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|SESSION' | grep -vE '^RECORD_' || true); fi
for n in $names; do
  v=$(eval "printf '%s' \"\${$n:-}\"")
  [ ${#v} -ge 6 ] || continue   # a short value would redact innocent text
  for target in "$tmp" ; do
    SECRET_VAL="$v" SECRET_REP="<REDACTED:$n>" awk 'BEGIN{v=ENVIRON["SECRET_VAL"];r=ENVIRON["SECRET_REP"]} {while((i=index($0,v))>0)$0=substr($0,1,i-1) r substr($0,i+length(v))} 1' "$target" >"$target.r" && mv "$target.r" "$target"
  done
  request=$(SECRET_VAL="$v" SECRET_REP="<REDACTED:$n>" awk 'BEGIN{v=ENVIRON["SECRET_VAL"];r=ENVIRON["SECRET_REP"]} {while((i=index($0,v))>0)$0=substr($0,1,i-1) r substr($0,i+length(v))} 1' <<<"$request")
done
# credential-shaped header / query values in the request line, regardless of env
request=$(printf '%s' "$request" \
  | sed -E 's/([Aa]uthorization: *[A-Za-z]+ +)[^"'"'"' ]+/\1<REDACTED>/g; s/((api[_-]?key|x-api-key|token|secret|password)[=:] *)[^"'"'"' &]+/\1<REDACTED>/Ig')

# 3. refuse anything still credential-shaped
scan "$tmp" || fail "not written. Re-take with a test account, a narrower request, or RECORD_SECRET_VARS naming the variable whose value leaked"

# 4. write: response verbatim (post-strip), request in the sidecar
mkdir -p "$dir"
{
  echo "recorded:   $day"
  echo "dependency: $dep"
  echo "case:       $case_"
  [ -n "$status" ] && echo "status:     $status"
  echo "request:    $request"
  echo "note:       reference recording — never edited; edge cases are COPIES that name this file"
} >"$tmpside"
scan "$tmpside" >/dev/null || fail "the request line still looks like it carries a credential; put the value in an env var and name it in RECORD_SECRET_VARS"
cp "$tmp" "$out"; cp "$tmpside" "$side"
echo "record ✓ $out  (+ $side)  — commit both; the test that parses this file through the real client is the one that touches the real thing"
