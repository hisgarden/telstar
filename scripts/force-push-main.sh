#!/usr/bin/env bash
#
# force-push-main.sh — HITL-gated force-push of local main to GitLab origin.
#
# For deliberate history rewrites (e.g. commit-message cleanups): GitLab
# protects main against force-pushes, so this elevates ONCE, under operator
# approval, and de-elevates no matter what happens:
#
#   preflight → show exactly what diverges → HITL gate (type "yes") →
#   allow force-push on the protected branch → push --force-with-lease →
#   RESTORE the protection (trap — runs even if the push fails)
#
# The gate fails closed: with no interactive terminal it refuses unless
# RELEASE_YES=1 / --yes explicitly pre-approves.
#
# Usage:
#   scripts/force-push-main.sh           # interactive (the normal, gated path)
#   scripts/force-push-main.sh --yes     # pre-approved (unattended)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PROJECT="hisgarden%2Ftelstar"
BRANCH="main"

fail() { echo "error: $*" >&2; exit 1; }
note() { echo "•  $*"; }
step() { echo; echo "=== $* ==="; }

# shellcheck source=lib/hitl.sh
. "$REPO_ROOT/scripts/lib/hitl.sh"

for arg in "$@"; do
  case "$arg" in
    --yes)     RELEASE_YES=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)         fail "unknown argument: $arg" ;;
  esac
done

# ── Preflight ────────────────────────────────────────────────────────────────
step "Preflight"
for t in git glab jq; do command -v "$t" >/dev/null || fail "missing tool: $t"; done
[ "$(git branch --show-current)" = "$BRANCH" ] || fail "on branch '$(git branch --show-current)', not '$BRANCH'"
DIRTY="$(git status --porcelain --untracked-files=no -- . ':(exclude)src-tauri/gen')"
[ -z "$DIRTY" ] || fail "working tree has uncommitted source changes — commit or stash first:
$DIRTY"
glab auth status >/dev/null 2>&1 || fail "glab is not authenticated (glab auth login)"
note "tooling + auth + clean tree"

git fetch origin "$BRANCH"
AHEAD="$(git rev-list --count origin/$BRANCH..HEAD)"
BEHIND="$(git rev-list --count HEAD..origin/$BRANCH)"
[ "$AHEAD" -gt 0 ] || fail "local $BRANCH has nothing origin lacks — nothing to push"
if [ "$BEHIND" -eq 0 ]; then
  fail "origin/$BRANCH is an ancestor of HEAD — a normal 'git push origin $BRANCH' suffices; refusing to elevate"
fi

# ── Show exactly what the rewrite does, then gate ────────────────────────────
step "Divergence — origin/$BRANCH vs local $BRANCH"
echo "REPLACED on origin ($BEHIND commits):"
git log --format='  - %h %s' "HEAD..origin/$BRANCH"
echo "PUSHED from local ($AHEAD commits):"
git log --format='  + %h %s' "origin/$BRANCH..HEAD"

hitl_confirm "About to FORCE-PUSH local $BRANCH → GitLab origin/$BRANCH:
  • $BEHIND origin commit(s) REPLACED, $AHEAD local commit(s) pushed
  • protected-branch force-push will be ENABLED for the duration, then restored
Review the commit lists above before approving." || exit 1

# ── Elevate, push, ALWAYS de-elevate ─────────────────────────────────────────
restore_protection() {
  step "Restoring branch protection (allow_force_push=false)"
  if glab api "projects/$PROJECT/protected_branches/$BRANCH" -X PATCH -f allow_force_push=false >/dev/null 2>&1; then
    note "protection restored"
  else
    echo "WARNING: could not restore allow_force_push=false — fix it NOW:" >&2
    echo "  glab api \"projects/$PROJECT/protected_branches/$BRANCH\" -X PATCH -f allow_force_push=false" >&2
  fi
}

step "Enabling force-push on protected $BRANCH (temporary)"
glab api "projects/$PROJECT/protected_branches/$BRANCH" -X PATCH -f allow_force_push=true >/dev/null \
  || fail "could not enable force-push (need Maintainer/Owner on the project)"
trap restore_protection EXIT
note "elevated (will be restored on exit)"

step "Force-pushing (with lease)"
git push --force-with-lease=refs/heads/$BRANCH "origin" "$BRANCH"
note "origin/$BRANCH now matches local $BRANCH"

################################################################################
# Changelog:
# 2026-06-10  Initial: HITL-gated elevate → force-push --with-lease → restore.
################################################################################
