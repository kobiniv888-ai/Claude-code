#!/usr/bin/env bash
# Finds and stops the website's own processes (sourced by start.sh and start-prod.sh).
#
# The development server runs as `sh -c next dev` → `node …/next dev` → `next-server (…)`, the
# production server ("the fast version") as `sh -c next start` → `node …/next start` →
# `next-server (…)`. They are matched from the START of the command line, so a shell whose command
# merely mentions them (for example `bash -c "… next start …"`) is never stopped by mistake.
#
#   site_running prod && echo "the fast version is running"
#   stop_site prod     # dev | prod | any — waits until they are gone (up to 15 s)

_site_descendants() { # all children, grandchildren… of a PID
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do
    echo "$child"
    _site_descendants "$child"
  done
}

site_pids() { # site_pids dev|prod|any → PIDs (with their children), one per line
  local re
  case "${1:-any}" in
    dev) re='dev' ;;
    prod) re='start' ;;
    *) re='(dev|start)' ;;
  esac
  local top pid
  top=$(pgrep -f "^(sh -c next ${re}|node [^ ]*/next ${re})( |\$)" 2>/dev/null || true)
  # A next-server whose parent is already gone belongs to no mode: stopped with "any" only.
  [ "${1:-any}" = "any" ] && top="$top $(pgrep -f '^next-server' 2>/dev/null || true)"
  for pid in $top; do
    echo "$pid"
    _site_descendants "$pid"
  done | sort -u
}

site_running() { # site_running dev|prod|any
  [ -n "$(site_pids "${1:-any}")" ]
}

stop_site() { # stop_site dev|prod|any
  local mode="${1:-any}" pids
  pids=$(site_pids "$mode")
  [ -z "$pids" ] && return 0
  # shellcheck disable=SC2086 # one PID per word
  kill $pids 2>/dev/null
  for _ in $(seq 1 15); do
    site_running "$mode" || return 0
    sleep 1
  done
  # shellcheck disable=SC2046
  kill -9 $(site_pids "$mode") 2>/dev/null
  return 0
}
