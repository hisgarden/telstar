#!/usr/bin/env bash
#
# bump-cask.sh — update the Telstar Homebrew cask to a released DMG.
#
# Rewrites `version` and `sha256` in Casks/telstar.rb of the separate tap repo
# `hisgarden/homebrew-telstar`, so `brew install --cask hisgarden/telstar/telstar`
# serves the new build. The sha256 is computed from the DMG you pass, so it can
# never drift from the artifact. Pushing is an explicit --push opt-in.
#
# Usage:
#   scripts/bump-cask.sh 0.5.0 path/to/Telstar_0.5.0_universal.dmg
#       preview the bump (compute sha, show the diff); do NOT push
#   scripts/bump-cask.sh 0.5.0 path/to/dmg --push
#       commit + push the cask to the tap
#   scripts/bump-cask.sh 0.5.0 path/to/dmg --expect-sha256 <hex> --push
#       fail unless the DMG digest matches <hex> (integrity cross-check)
#   scripts/bump-cask.sh 0.5.0 path/to/dmg --tap-dir ~/src/homebrew-telstar --push
#       use an existing tap checkout instead of cloning a fresh one
#
set -euo pipefail

TAP_REPO="git@github.com:hisgarden/homebrew-telstar.git"
CASK_PATH="Casks/telstar.rb"
CASK_NAME="telstar"

fail() { echo "error: $*" >&2; exit 1; }

VERSION=""; DMG=""; EXPECT_SHA=""; DO_PUSH=0; TAP_DIR=""
args=("$@")
i=0
while [ "$i" -lt "${#args[@]}" ]; do
  a="${args[$i]}"
  case "$a" in
    --push)          DO_PUSH=1 ;;
    --expect-sha256) i=$((i+1)); EXPECT_SHA="${args[$i]:-}"; case "$EXPECT_SHA" in ''|--*) fail "--expect-sha256 needs a value";; esac ;;
    --tap-dir)       i=$((i+1)); TAP_DIR="${args[$i]:-}";   case "$TAP_DIR"   in ''|--*) fail "--tap-dir needs a value";;   esac ;;
    -h|--help)       grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)              fail "unknown flag: $a" ;;
    *) if [ -z "$VERSION" ]; then VERSION="$a";
       elif [ -z "$DMG" ]; then DMG="$a";
       else fail "unexpected argument: $a"; fi ;;
  esac
  i=$((i+1))
done

[ -n "$VERSION" ] || fail "usage: bump-cask.sh <version> <dmg> [--expect-sha256 hex] [--push] [--tap-dir path]"
[ -n "$DMG" ]     || fail "missing <dmg> path"
[ -f "$DMG" ]     || fail "DMG not found: $DMG"
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-(rc|beta|alpha)\.[0-9]+)?$' \
  || fail "invalid version '$VERSION'"

SHA="$(shasum -a 256 "$DMG" | awk '{print $1}')"
[ -n "$SHA" ] || fail "could not compute sha256 of $DMG"
if [ -n "$EXPECT_SHA" ] && [ "$EXPECT_SHA" != "$SHA" ]; then
  fail "sha256 mismatch — DMG is $SHA but --expect-sha256 said $EXPECT_SHA"
fi
echo "DMG sha256: $SHA"

# Obtain a tap checkout: an existing --tap-dir, else a shallow clone.
CLONE_TMP=""
if [ -n "$TAP_DIR" ]; then
  [ -f "$TAP_DIR/$CASK_PATH" ] || fail "no $CASK_PATH under --tap-dir $TAP_DIR"
else
  CLONE_TMP="$(mktemp -d)"
  trap '[ -n "$CLONE_TMP" ] && rm -rf "$CLONE_TMP"' EXIT
  echo "cloning tap into $CLONE_TMP ..."
  git clone --depth 1 -q "$TAP_REPO" "$CLONE_TMP"
  TAP_DIR="$CLONE_TMP"
fi
CASK="$TAP_DIR/$CASK_PATH"

# Rewrite version + sha256, bounded to the `cask "telstar" do ... end` block.
tmp="$(mktemp)"
awk -v ver="$VERSION" -v sha="$SHA" -v name="$CASK_NAME" '
  $0 ~ "^cask \"" name "\" do"                  { in_cask=1 }
  in_cask && /^end[[:space:]]*$/                { in_cask=0 }
  in_cask && !vdone && /^[[:space:]]*version[[:space:]]+"/ { sub(/"[^"]*"/, "\"" ver "\""); vdone=1 }
  in_cask && !sdone && /^[[:space:]]*sha256[[:space:]]+"/  { sub(/"[^"]*"/, "\"" sha "\""); sdone=1 }
  { print }
  END { if (!vdone || !sdone) exit 3 }
' "$CASK" > "$tmp" || { rm -f "$tmp"; fail "cask malformed — version or sha256 line not found in $CASK_PATH"; }

if diff -q "$CASK" "$tmp" >/dev/null; then
  rm -f "$tmp"
  echo "cask already at $VERSION with this digest — nothing to do."
  exit 0
fi
mv "$tmp" "$CASK"

echo "=== cask diff ==="
( cd "$TAP_DIR" && git --no-pager diff -- "$CASK_PATH" )

if [ "$DO_PUSH" -eq 0 ]; then
  echo "preview only — re-run with --push to commit + push to the tap."
  exit 0
fi

# Commit with the GitHub noreply identity: GitHub rejects pushes that would
# expose a private email, and the public tap should not carry a real address.
gh_login="$(gh api user --jq '.login' 2>/dev/null || true)"
gh_id="$(gh api user --jq '.id' 2>/dev/null || true)"
if [ -n "$gh_login" ] && [ -n "$gh_id" ]; then
  commit_name="$gh_login"
  commit_email="${gh_id}+${gh_login}@users.noreply.github.com"
else
  commit_name="telstar-release"
  commit_email="telstar-release@users.noreply.github.com"
fi
( cd "$TAP_DIR"
  git add "$CASK_PATH"
  git -c user.name="$commit_name" -c user.email="$commit_email" commit -q -m "$CASK_NAME $VERSION"
  git push -q origin HEAD
)
echo "pushed cask $CASK_NAME $VERSION to the tap (as $commit_email)."
