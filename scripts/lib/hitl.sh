#!/bin/sh
# hitl.sh — human-in-the-loop approval gate for elevated remote operations.
#
# Source this file and call:
#   hitl_confirm "<summary of exactly what is about to happen>"
#
# Behavior (fail-closed by design):
#   • Interactive terminal: prints the summary and requires the operator to
#     type "yes" — anything else (or EOF) aborts the calling script.
#   • Non-interactive (no readable /dev/tty — CI, agents, pipes): REFUSES
#     unless RELEASE_YES=1 is set. Automation can never approve itself; a
#     human either types the approval or explicitly pre-authorizes the run.
#
# POSIX sh — sourced by both bash scripts and #!/bin/sh scripts.
#
hitl_confirm() {
  _hitl_summary="$1"
  if [ "${RELEASE_YES:-0}" = "1" ]; then
    echo "•  HITL gate: pre-approved (RELEASE_YES=1)"
    return 0
  fi
  echo ""
  echo "┌─ HITL gate — operator approval required ──────────────────────────────"
  printf '%s\n' "$_hitl_summary" | sed 's/^/│ /'
  echo "└────────────────────────────────────────────────────────────────────────"
  # Probe by actually opening the tty — [ -r /dev/tty ] is true even in
  # non-interactive contexts where the open would fail ("Device not configured").
  if ! (exec < /dev/tty) 2>/dev/null; then
    echo "error: HITL gate needs an interactive terminal — re-run from a terminal," >&2
    echo "       or pre-approve explicitly with RELEASE_YES=1 (or --yes where supported)" >&2
    return 1
  fi
  printf 'Type "yes" to proceed (anything else aborts): '
  if ! read -r _hitl_reply < /dev/tty; then
    _hitl_reply=""
  fi
  if [ "$_hitl_reply" != "yes" ]; then
    echo "error: aborted by operator" >&2
    return 1
  fi
  echo "•  HITL gate: approved by operator"
}

################################################################################
# Changelog:
# 2026-06-10  Initial: fail-closed operator approval gate (tty yes / RELEASE_YES).
################################################################################
