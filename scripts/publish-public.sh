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
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree is dirty — commit or stash before publishing." >&2
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

(
  cd "$WORKTREE"
  git checkout --orphan "$BRANCH" >/dev/null 2>&1
  git rm -r --cached --quiet docs >/dev/null 2>&1 || true
  rm -rf docs
  git add -A
  git commit -q -m "Telstar — public source release (AGPL-3.0)

The world's live television, on your favorite device. A free, open-source,
local-first TV player. Not a web app; runs on-device, no account, no tracking.

Licensed under AGPL-3.0-or-later — see LICENSE."
)

echo "Publishing docs-free snapshot of $SRC to $REMOTE/$TARGET ..."
git push --force "$REMOTE" "$BRANCH:$TARGET"
echo "Published to $REMOTE/$TARGET."
