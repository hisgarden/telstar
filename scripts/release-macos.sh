#!/usr/bin/env bash
#
# release-macos.sh — build, sign, notarize, and publish the macOS DMG.
#
# One maintainer-run command for a macOS release. Signing keys never leave this
# Mac: the Developer ID identity and notarization credentials are read from the
# environment (export them, or drop them in a gitignored .env.release). Ordering
# is deliberate — NOTHING reaches a remote until the DMG is built and verified:
#
#   install deps -> source creds -> preflight -> create LOCAL version tag ->
#   tauri build (universal, signed + notarized + stapled) -> verify the DMG
#   ── only now, the remote writes ──
#   push canonical tag to GitLab -> mirror docs-free snapshot to GitHub +
#   create the Release (reused on re-run) -> upload the DMG -> verify the
#   PUBLISHED asset matches -> bump + push the Homebrew cask from that asset.
#
# GitLab (origin) is canonical. GitHub (hisgarden/telstar) carries only the
# orphan source snapshot plus the Release that hosts the binary. The Release tag
# roots on the snapshot via `--target main` (the push already advanced the ref),
# so the full GitLab history is never mirrored.
#
# Required environment (for a real release; not needed for --check):
#   APPLE_SIGNING_IDENTITY   e.g. "Developer ID Application: Jin Wen (NSDC3EDS2G)"
#   notarization, EITHER App Store Connect API key:
#     APPLE_API_ISSUER, APPLE_API_KEY (key id), APPLE_API_KEY_PATH (.p8 path)
#   OR Apple ID:
#     APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID
#
# Usage:
#   scripts/release-macos.sh 0.5.0 --check     # verify the environment is release-ready; build nothing
#   scripts/release-macos.sh 0.5.0 --dry-run   # build + sign + notarize + verify the DMG; NO remote writes
#   scripts/release-macos.sh 0.5.0             # full release (Touch ID prompts expected)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

GH_REPO="hisgarden/telstar"
TARGET="universal-apple-darwin"

fail() { echo "error: $*" >&2; exit 1; }
note() { echo "•  $*"; }
step() { echo; echo "=== $* ==="; }

VERSION=""; MODE="release"; ENV_FILE=".env.release"
for arg in "$@"; do
  case "$arg" in
    --check)    MODE="check" ;;
    --dry-run)  MODE="dry-run" ;;
    --env-file=*) ENV_FILE="${arg#*=}" ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)         fail "unknown flag: $arg" ;;
    *)          [ -z "$VERSION" ] || fail "unexpected extra argument: $arg"; VERSION="$arg" ;;
  esac
done

[ -n "$VERSION" ] || fail "usage: release-macos.sh <X.Y.Z> [--check|--dry-run]"
printf '%s' "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-(rc|beta|alpha)\.[0-9]+)?$' \
  || fail "invalid version '$VERSION'"
TAG="v$VERSION"
DMG_NAME="Telstar_${VERSION}_universal.dmg"
DMG="src-tauri/target/$TARGET/release/bundle/dmg/$DMG_NAME"
APP="src-tauri/target/$TARGET/release/bundle/macos/Telstar.app"

# Install deps BEFORE credentials enter the environment, so package postinstall
# scripts never see the notarization secrets.
if [ "$MODE" != "check" ]; then
  step "Installing dependencies"
  bun install --frozen-lockfile
fi

# Optional credentials file (gitignored), so secrets stay out of shell history.
if [ -f "$ENV_FILE" ]; then
  note "sourcing $ENV_FILE"
  set -a
  # shellcheck source=/dev/null
  . "./$ENV_FILE"
  set +a
fi

have_api_key()  { [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]; }
have_apple_id() { [ -n "${APPLE_ID:-}" ] && [ -n "${APPLE_PASSWORD:-}" ] && [ -n "${APPLE_TEAM_ID:-}" ]; }

# ── Auto-detect credentials from their standard homes ────────────────────────
# So .env.release only needs the App Store Connect issuer UUID (the one secret
# not discoverable on this Mac). Explicit env vars always win over detection.
DEFAULT_KEY_DIR="$HOME/.appstoreconnect/private_keys"

# Developer ID signing identity — read from the keychain (normally exactly one).
if [ -z "${APPLE_SIGNING_IDENTITY:-}" ]; then
  APPLE_SIGNING_IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
    | grep 'Developer ID Application' | head -1 | sed -E 's/.*"(.*)"/\1/')"
  [ -n "$APPLE_SIGNING_IDENTITY" ] && note "auto-detected signing identity from keychain: $APPLE_SIGNING_IDENTITY"
fi

# App Store Connect API key — find the AuthKey_<id>.p8 in the default location
# (notarytool needs the path; the key id is the file's base name).
if [ -z "${APPLE_API_KEY_PATH:-}" ]; then
  if [ -n "${APPLE_API_KEY:-}" ] && [ -f "$DEFAULT_KEY_DIR/AuthKey_$APPLE_API_KEY.p8" ]; then
    APPLE_API_KEY_PATH="$DEFAULT_KEY_DIR/AuthKey_$APPLE_API_KEY.p8"
  else
    _k="$(ls "$DEFAULT_KEY_DIR"/AuthKey_*.p8 2>/dev/null | head -1 || true)"
    if [ -n "$_k" ]; then
      APPLE_API_KEY_PATH="$_k"
      [ -n "${APPLE_API_KEY:-}" ] || APPLE_API_KEY="$(basename "$_k" | sed -E 's/AuthKey_(.*)\.p8/\1/')"
    fi
  fi
  [ -n "${APPLE_API_KEY_PATH:-}" ] && note "auto-detected API key: $APPLE_API_KEY ($APPLE_API_KEY_PATH)"
fi

# Export the API-key trio so `tauri build` notarizes during bundling (it reads
# them from the environment; a partial/unexported set is silently skipped).
[ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] \
  && export APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH

# ── Preflight ────────────────────────────────────────────────────────────────
step "Preflight — $MODE — $TAG"
for t in bun gh git shasum rustup jq; do command -v "$t" >/dev/null || fail "missing tool: $t"; done
note "tooling present"

BRANCH="$(git branch --show-current)"

for a in aarch64-apple-darwin x86_64-apple-darwin; do
  rustup target list --installed 2>/dev/null | grep -qx "$a" || fail "rust target not installed: $a (rustup target add $a)"
done
note "universal rust targets installed"

[ -n "${APPLE_SIGNING_IDENTITY:-}" ] || fail "APPLE_SIGNING_IDENTITY is not set (export it or add it to $ENV_FILE)"
security find-identity -v -p codesigning 2>/dev/null | grep -qF "$APPLE_SIGNING_IDENTITY" \
  || fail "signing identity not found in keychain: $APPLE_SIGNING_IDENTITY"
note "signing identity present: $APPLE_SIGNING_IDENTITY"

if have_api_key; then
  [ -f "$APPLE_API_KEY_PATH" ] || fail "APPLE_API_KEY_PATH does not exist: $APPLE_API_KEY_PATH"
  [[ "$APPLE_API_ISSUER" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
    || fail "APPLE_API_ISSUER must be the App Store Connect issuer UUID (got '$APPLE_API_ISSUER' — add the real one to $ENV_FILE)"
  note "notarization: App Store Connect API key"
elif have_apple_id; then
  note "notarization: Apple ID + app-specific password"
else
  fail "no notarization credentials — set the APPLE_API_* trio or the APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID trio"
fi

gh auth status >/dev/null 2>&1 || fail "gh is not authenticated (gh auth login)"
note "gh authenticated"

# Privacy-posture (R9): surface any capability/CSP change since the last tag.
# Separate a git failure (can't compute) from grep finding nothing (no change).
PREV_TAG="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$TAG" ]; then
  if RAW_DIFF="$(git diff "$PREV_TAG"..HEAD -- src-tauri/capabilities/ src-tauri/tauri.conf.json 2>/dev/null)"; then
    POSTURE="$(printf '%s\n' "$RAW_DIFF" | grep -iE '^[+-].*(csp|capabilit|allow|security)' || true)"
    if [ -n "$POSTURE" ]; then
      note "posture changed since $PREV_TAG — review before shipping:"; printf '%s\n' "$POSTURE"
    else
      note "privacy posture unchanged since $PREV_TAG"
    fi
  else
    note "could not diff posture vs $PREV_TAG (tag object missing?) — review manually"
  fi
fi

if [ "$MODE" = "check" ]; then
  step "Check complete — environment is release-ready for $TAG"; exit 0
fi

# ── Version + LOCAL canonical tag (not pushed until the DMG verifies) ────────
if [ "$MODE" = "release" ]; then
  if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    note "tag $TAG already exists locally — reusing"
  else
    step "Creating canonical version + tag (local)"
    scripts/bump-version.sh "$VERSION"     # local only — push happens after verification
  fi
fi

# ── Build (signs + notarizes + staples via tauri.conf.json macOS config) ────
# Tauri's bundle_dmg.sh fails if a prior run left a read-write scratch image
# attached. Detach any stale Telstar scratch images and drop rw.*.dmg leftovers.
step "Clearing stale DMG scratch state"
for dev in $(hdiutil info | awk '/^image-path/{tel=($0 ~ /Telstar/)} tel && /^\/dev\/disk[0-9]+[[:space:]]/{print $1; tel=0}'); do
  hdiutil detach "$dev" -force >/dev/null 2>&1 || true
done
find src-tauri/target -name 'rw.*.dmg' -delete 2>/dev/null || true
note "scratch state clear"

step "Building universal DMG (signed + notarized)"
export APPLE_SIGNING_IDENTITY
note "this signs with Developer ID and notarizes — expect Touch ID / a notarization wait"
# CI=true makes Tauri's bundle_dmg.sh skip the Finder-prettifying AppleScript
# (--skip-jenkins). That AppleScript drives Finder via osascript, which is
# blocked on locked-down / headless Macs and otherwise fails the DMG step. The
# DMG is functional (signed/notarized), just without custom window aesthetics.
CI=true bun tauri build --target "$TARGET"
[ -f "$DMG" ] || fail "expected DMG not found: $DMG"
note "built: $DMG"

# Tauri notarizes + staples the .app, but NOT the DMG container. Notarize and
# staple the DMG too, so the distributed artifact is self-contained: a direct
# download passes Gatekeeper offline, and `stapler validate` on the DMG passes.
step "Notarizing + stapling the DMG"
if have_api_key; then
  notary_auth=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
else
  notary_auth=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
fi
xcrun notarytool submit "$DMG" "${notary_auth[@]}" --wait || fail "DMG notarization failed"
xcrun stapler staple "$DMG" || fail "stapling the DMG failed"
note "DMG notarized + stapled"

# ── Verify before any remote write ──────────────────────────────────────────
# stapler validate is the authoritative notarization gate; codesign --verify is
# the authoritative signing gate. spctl's assessment type is finicky across
# macOS versions for DMGs, so it is informational only — never aborts a release.
step "Verifying signature, notarization, stapling"
if [ -d "$APP" ]; then
  codesign --verify --deep --strict --verbose=2 "$APP" || fail "codesign verify failed on $APP"
  echo "  signing authority:"; codesign -dvvv "$APP" 2>&1 | grep -E 'Authority=|Runtime|TeamIdentifier=' || true
fi
xcrun stapler validate "$DMG" || fail "stapler validate failed — DMG is not stapled/notarized"
if spctl -a -t open --context context:primary-signature -vvv "$DMG" 2>&1 | grep -qi 'accepted'; then
  note "Gatekeeper: accepted"
else
  note "Gatekeeper assessment inconclusive (spctl DMG-type quirk) — stapler already confirmed notarization"
fi
note "DMG is Developer-ID-signed, notarized, and stapled"

if [ "$MODE" = "dry-run" ]; then
  step "Dry-run complete — DMG verified, no remote writes"
  note "artifact: $DMG"
  note "sha256:   $(shasum -a 256 "$DMG" | awk '{print $1}')"
  exit 0
fi

# ── Remote writes (all below this line; the DMG is verified) ─────────────────
step "Pushing canonical commit + tag to GitLab"
git push origin "HEAD:$BRANCH" "$TAG"
note "origin/$BRANCH + $TAG updated on GitLab"

step "Publishing GitHub Release $TAG"
NOTES="Telstar $TAG — macOS universal build (Developer ID signed + notarized).

Install / upgrade:  brew install --cask hisgarden/telstar/telstar"
if gh release view "$TAG" -R "$GH_REPO" >/dev/null 2>&1; then
  note "release $TAG already exists — reusing (snapshot not re-pushed, so source/binary stay aligned)"
else
  PUBLIC_REMOTE=github scripts/publish-public.sh
  gh release create "$TAG" -R "$GH_REPO" --target main --title "$TAG" --notes "$NOTES"
  note "created release $TAG rooted on github/main snapshot"
fi
gh release upload "$TAG" "$DMG" -R "$GH_REPO" --clobber
note "uploaded $DMG_NAME"

# Hash what GitHub actually serves, not the local file — catches upload corruption.
step "Verifying published asset"
VDIR="$(mktemp -d)"; trap 'rm -rf "$VDIR"' EXIT
gh release download "$TAG" -R "$GH_REPO" --pattern "$DMG_NAME" --dir "$VDIR" --clobber
PUBLISHED="$VDIR/$DMG_NAME"
LOCAL_SHA="$(shasum -a 256 "$DMG" | awk '{print $1}')"
PUB_SHA="$(shasum -a 256 "$PUBLISHED" | awk '{print $1}')"
[ "$LOCAL_SHA" = "$PUB_SHA" ] || fail "published asset digest ($PUB_SHA) != local DMG ($LOCAL_SHA) — upload corrupted, cask NOT bumped"
note "published asset matches local DMG: $PUB_SHA"

step "Bumping Homebrew cask"
scripts/bump-cask.sh "$VERSION" "$PUBLISHED" --expect-sha256 "$PUB_SHA" --push

step "Released $TAG"
note "DMG: https://github.com/$GH_REPO/releases/download/$TAG/$DMG_NAME"
note "verify with:  brew update && brew upgrade --cask telstar   (or: brew install --cask hisgarden/telstar/telstar)"
