#!/usr/bin/env bash
#
# bump-version.sh — set Telstar's version across all manifests and tag it.
#
# Syncs the version string in three files to one semver, then (locally) commits
# the change and creates an annotated tag. GitLab (origin) is canonical, so the
# tag belongs there; pushing is an explicit, separate opt-in (--push) so running
# the script never reaches a remote by accident.
#
#   package.json                 .version
#   src-tauri/Cargo.toml         [package] version  (dependency versions untouched)
#   src-tauri/tauri.conf.json    .version           (bundle.iOS.bundleVersion untouched)
#
# Usage:
#   scripts/bump-version.sh 0.5.1            # edit + commit + annotated tag v0.5.1 (local)
#   scripts/bump-version.sh 0.5.1 --push     # also push the commit + tag to origin (GitLab)
#   scripts/bump-version.sh 0.5.1 --dry-run  # show the diff only; revert edits, no tag
#   scripts/bump-version.sh 0.6.0-rc.1       # rc/beta/alpha pre-release tags are allowed
#   scripts/bump-version.sh 0.5.1 --force    # allow running on a non-main branch
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PKG="package.json"
CARGO="src-tauri/Cargo.toml"
CONF="src-tauri/tauri.conf.json"

fail() { echo "error: $*" >&2; exit 1; }

VERSION=""
DRY_RUN=0
DO_PUSH=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --push)    DO_PUSH=1 ;;
    --force)   FORCE=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)        fail "unknown flag: $arg" ;;
    *)         [ -z "$VERSION" ] || fail "unexpected extra argument: $arg"; VERSION="$arg" ;;
  esac
done

[ -n "$VERSION" ] || fail "usage: bump-version.sh <X.Y.Z[-(rc|beta|alpha).N]> [--push] [--dry-run] [--force]"

# Validate semver (release or rc/beta/alpha pre-release).
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-(rc|beta|alpha)\.[0-9]+)?$'; then
  fail "invalid version '$VERSION' — expected X.Y.Z or X.Y.Z-(rc|beta|alpha).N"
fi
TAG="v$VERSION"

# Preconditions: clean tree, on main (unless --force).
[ -z "$(git status --porcelain)" ] || fail "working tree is dirty — commit or stash first"
BRANCH="$(git branch --show-current)"
if [ "$BRANCH" != "main" ] && [ "$FORCE" -eq 0 ]; then
  fail "on branch '$BRANCH', not 'main' — re-run with --force to override"
fi

# Never move an existing tag.
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  fail "tag $TAG already exists — refusing to move it"
fi

# --- apply edits ---
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

# package.json + tauri.conf.json via jq (.version only), every other key intact.
jq --arg v "$VERSION" '.version = $v' "$PKG"  > "$tmp" && mv "$tmp" "$PKG"
tmp="$(mktemp)"
jq --arg v "$VERSION" '.version = $v' "$CONF" > "$tmp" && mv "$tmp" "$CONF"
tmp="$(mktemp)"

# Cargo.toml [package] version only — bounded so a [dependencies] entry can't match.
awk -v ver="$VERSION" '
  /^\[/ { in_pkg = ($0 ~ /^\[package\][[:space:]]*$/) }
  in_pkg && !done && /^[[:space:]]*version[[:space:]]*=/ {
    sub(/=[[:space:]]*"[^"]*"/, "= \"" ver "\""); done = 1
  }
  { print }
' "$CARGO" > "$tmp" && mv "$tmp" "$CARGO"

echo "=== version → $VERSION ==="
git --no-pager diff -- "$PKG" "$CARGO" "$CONF" || true

if [ "$DRY_RUN" -eq 1 ]; then
  git checkout -- "$PKG" "$CARGO" "$CONF"
  echo "dry-run: reverted edits, no commit or tag created."
  exit 0
fi

# Commit only if something changed (manifests may already be at $VERSION).
if [ -n "$(git status --porcelain -- "$PKG" "$CARGO" "$CONF")" ]; then
  git add "$PKG" "$CARGO" "$CONF"
  git commit -q -m "chore(release): v$VERSION"
  echo "committed version bump."
else
  echo "manifests already at $VERSION — tagging current HEAD."
fi

git tag -a "$TAG" -m "Release $TAG"
echo "created annotated tag $TAG."

if [ "$DO_PUSH" -eq 1 ]; then
  git push origin "HEAD:$BRANCH" "$TAG"
  echo "pushed $BRANCH + $TAG to origin (GitLab)."
else
  echo "local only — push with:  git push origin $BRANCH $TAG   (or re-run with --push)"
fi
