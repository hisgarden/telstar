#!/bin/sh
# Publish a docs-free public snapshot of the current HEAD to the GitHub mirror.
#
# Telstar keeps full history + docs on GitLab (origin); the public GitHub repo
# gets a single clean commit with docs/ stripped. This rebuilds that snapshot
# from HEAD in a throwaway worktree (your checkout is never touched) and
# force-pushes it to `<remote> main` (default remote: github).
#
# Usage:
#   scripts/publish-public.sh                 # push to remote 'github', branch 'main'
#   PUBLIC_REMOTE=gh scripts/publish-public.sh
set -eu

REMOTE="${PUBLIC_REMOTE:-github}"
BRANCH="_public_snapshot"
TARGET="main"

# Refuse to publish a dirty tree — the snapshot must match a committed HEAD.
# Robust: ignore untracked files and the generated mobile projects under
# src-tauri/gen (build artifacts that don't affect the published snapshot);
# only uncommitted *source* changes should block.
DIRTY="$(git status --porcelain --untracked-files=no -- . ':(exclude)src-tauri/gen')"
if [ -n "$DIRTY" ]; then
  echo "error: working tree has uncommitted source changes — commit or stash before publishing:" >&2
  echo "$DIRTY" >&2
  exit 1
fi

# The public remote must exist.
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "error: no git remote named '$REMOTE'. Add it, e.g.:" >&2
  echo "  git remote add $REMOTE git@github.com:hisgarden/telstar.git" >&2
  exit 1
fi

SRC=$(git rev-parse --short HEAD)

# Throwaway worktree (git creates the dir; mktemp just reserves a unique name).
WORKTREE=$(mktemp -d)
rmdir "$WORKTREE"
cleanup() {
  git worktree remove --force "$WORKTREE" 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null || true
}
trap cleanup EXIT

git worktree remove --force "$WORKTREE" 2>/dev/null || true
git branch -D "$BRANCH" 2>/dev/null || true
git worktree add --detach "$WORKTREE" HEAD >/dev/null

# Author the snapshot as the GitHub noreply identity so the mirror's
# Contributors graph links to the GitHub account (not an unlinked, GitLab-noreply
# "Anonymous" entry) — while keeping a real email out of the public history.
PUB_NAME="$(git config user.name || echo hisgarden)"
PUB_EMAIL="$(git config user.email)"
if gh_login="$(gh api user --jq '.login' 2>/dev/null)" && gh_id="$(gh api user --jq '.id' 2>/dev/null)" \
   && [ -n "$gh_login" ] && [ -n "$gh_id" ]; then
  PUB_NAME="$gh_login"
  PUB_EMAIL="${gh_id}+${gh_login}@users.noreply.github.com"
fi

(
  cd "$WORKTREE"
  git checkout --orphan "$BRANCH" >/dev/null 2>&1
  git rm -r --cached --quiet docs >/dev/null 2>&1 || true
  rm -rf docs
  git add -A
  git -c user.name="$PUB_NAME" -c user.email="$PUB_EMAIL" commit -q -m "Telstar — public source release (AGPL-3.0)

The world's live television, on your favorite device. A free, open-source,
local-first TV player. Not a web app; runs on-device, no account, no tracking.

Licensed under AGPL-3.0-or-later — see LICENSE."
)

# HITL gate before the force-push (a release-macos.sh parent that already got
# operator approval exports RELEASE_YES=1, so this doesn't double-ask).
# shellcheck source=lib/hitl.sh
. "$(dirname "$0")/lib/hitl.sh"
hitl_confirm "About to FORCE-PUSH the docs-free snapshot of $SRC
  → $(git remote get-url "$REMOTE") ($TARGET)
This replaces the public mirror's history with the new orphan commit." || exit 1

echo "Publishing docs-free snapshot of $SRC to $REMOTE/$TARGET ..."
git push --force "$REMOTE" "$BRANCH:$TARGET"
echo "Published to $REMOTE/$TARGET."

################################################################################
# Changelog:
# 2026-06-10  Robust dirty check: ignore untracked files + src-tauri/gen builds.
################################################################################
