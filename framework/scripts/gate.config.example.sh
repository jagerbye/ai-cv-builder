#!/usr/bin/env bash
# gate.config.example.sh — copy to gate.config.sh (next to this file) and fill
# with the project's real commands. gate.config.sh is the ONE place "green" is
# defined (docs/testing-strategy.md §Commands points here). This file is
# sourced by gate.sh and the hooks, so it may only define variables — never
# run anything. The filled-in config next to it, gate.config.sh, is this
# project's real one; this file keeps the template's shape for comparison.
#
# NOTHING IN THIS FILE IS A FRAMEWORK DEFAULT. Every concrete command, path and
# name below is ONE illustrative toolchain (a JS package runner, its type
# checker, one project's health route, cookie and root element) shown so the
# SHAPE of each variable is clear. It is marked `EXAMPLE` line by line. Keep
# the step NAMES — gate.sh, the hooks and CI key on them — and replace every
# EXAMPLE value with what architecture.md §1 names for this project. The
# values are kept runnable rather than written as <angle brackets> because a
# config that cannot be sourced blocks the first agent of a new project (the
# scaffold task) before it has written a line; a wrong-but-runnable example
# fails loud in the gate instead, where it is seen and replaced.

# --- Shared setup (optional) -------------------------------------------------
# A step that brings up what the tests need — a database, a container, a
# migration. Idempotent, cheap when already up. Runs first in BOTH modes.
GATE_SETUP='true'   # EXAMPLE: 'docker compose up -d --wait db && <migrate>' — yours per §1

# --- Wave mode (knowledge/errors.md: "union red while lanes in flight") ------
# While parallel lanes share one tree, the UNION of typecheck/test/build is red
# BY DESIGN: a sibling lane's tests exist before its implementation does, and
# tests come first by rule. Judging a lane by the union fails every lane for
# its neighbours' half-finished work — and no model, however strong, can fix
# another lane's missing file from inside its own. One wave was lost to this
# before the mode existed; a stronger model failing every task identically is
# the signature of a wrong criterion, not a hard task.
#
# So while framework/scripts/.wave-in-flight exists (wave.sh start|end owns it;
# it is gitignored and never committed), "green" for a lane is: setup + lint
# (lint does not resolve across modules) + that lane's OWN tests, passed by
# the runner or the brief in GATE_LANE_TEST. The union belongs to the
# Integrator, who forces it with GATE_FULL=1 after each merge.
if [ -f framework/scripts/.wave-in-flight ] && [ -z "${GATE_FULL:-}" ]; then
  GATE_STEPS=( "setup:${GATE_SETUP}" "lint:npm run -s lint" )   # EXAMPLE runner+linter: replace `npm run -s lint` with §1's linter
  [ -n "${GATE_LANE_TEST:-}" ] && GATE_STEPS+=( "lane-test:${GATE_LANE_TEST}" )
else
  # Full gate: Stop hook outside a wave, Integrator (GATE_FULL=1), CI, humans.
  # Order: fail fast — cheapest first. `smoke` is last and is the one step that
  # proves the composed product opens; it never runs in wave mode.
  GATE_STEPS=(
    "setup:${GATE_SETUP}"
    "typecheck:npm run -s typecheck"    # EXAMPLE: §1's type checker (a type-check is NOT a lint and NOT a build)
    "lint:npm run -s lint"              # EXAMPLE: §1's linter — must be a real linter, named in §1
    "test:npm run -s test"              # EXAMPLE: §1's test runner IN §1's test environment (DOM for UI)
    "build:npm run -s build"            # EXAMPLE: §1's bundler/build — must produce the shipped artifact
    "smoke:npx vitest run --config tests/smoke/vitest.config.ts"   # this project: tests/smoke/ (the template ships a curl-based smoke.sh instead)
  )
fi

# --- Smoke (tests/smoke/, run as the gate's last step) ------------------------
# The seam no unit or integration suite instantiates: a browser's origin, the
# server behind it, the API reached THROUGH that origin. In this project the
# step is a real vitest suite (tests/smoke/stack.smoke.test.ts) that reads
# SMOKE_WEB_URL and skips loudly when nothing answers there; the template's
# generic version is a curl script driven by the variables below. Either way
# the values are per project: your health route, landmark and cookie name are
# whatever architecture.md §3.1 and api-contracts.md say they are.
export SMOKE_WEB_URL="${SMOKE_WEB_URL:-}"                        # the origin a BROWSER uses — EXAMPLE: http://127.0.0.1:${WEB_PORT:-8080}
export SMOKE_APP_MATCH="${SMOKE_APP_MATCH:-<div id=\"root\">}"   # EXAMPLE landmark; use a string only YOUR served app page contains
export SMOKE_HEALTH_PATH="${SMOKE_HEALTH_PATH:-/api/health}"     # EXAMPLE route; must answer JSON through SMOKE_WEB_URL — yours per §3.1
export SMOKE_HEALTH_MATCH="${SMOKE_HEALTH_MATCH:-\"ok\"}"        # EXAMPLE body fragment; whatever YOUR health contract returns
export SMOKE_SESSION_PATH="${SMOKE_SESSION_PATH:-}"              # EXAMPLE: /api/auth/login — empty skips the session check
export SMOKE_SESSION_CURL_ARGS="${SMOKE_SESSION_CURL_ARGS:-}"    # EXAMPLE: -X POST -H content-type:application/json -d @tests/smoke/session.json
export SMOKE_SESSION_COOKIE="${SMOKE_SESSION_COOKIE:-sid}"       # EXAMPLE cookie name; YOUR session cookie, from api-contracts.md

# --- Fast per-file check (PostToolUse hook, after every Edit/Write) ----------
# Gets the edited file path as $1. Keep it <2s; empty string disables it.
# It MUST degrade silently when the project is not yet installable: the first
# agent of a new project writes the scaffold, and a fast check that needs the
# toolchain would block exactly that agent. During a wave it also stays quiet:
# a cross-lane type error is not the editing agent's to fix.
# EXAMPLE for one toolchain (a JS type checker in node_modules): swap the
# guard and the per-extension command for §1's tools; keep the two early
# returns — they are the rule, the rest is illustration.
FAST_CHECK='f(){ [ -x node_modules/.bin/tsc ] || return 0; [ -f framework/scripts/.wave-in-flight ] && return 0; case "$1" in *.ts|*.tsx) node_modules/.bin/tsc --noEmit ;; *.js) node --check "$1" ;; esac; }; f'
