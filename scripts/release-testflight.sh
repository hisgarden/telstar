#!/usr/bin/env bash
#
# release-testflight.sh — build, sign, and upload the iOS app to TestFlight.
#
# One maintainer-run command for a TestFlight beta. Mirrors release-macos.sh:
# nothing reaches App Store Connect until the App Store .ipa is built and the
# upload credentials verify. Signing uses the "Apple Distribution" identity
# (automatic signing mints the App Store provisioning profile); the upload uses
# an App Store Connect API key.
#
# Prerequisites (one-time, in your Apple account — this script does NOT create them):
#   • An "Apple Distribution" certificate in the login keychain.
#   • The app registered in App Store Connect (bundle id org.hisgarden.telstar)
#     with at least one TestFlight-eligible record. The upload fails otherwise.
#
# Required environment (a gitignored .env.release is sourced if present) —
# App Store Connect API key (same trio release-macos.sh can use for notarization):
#   APPLE_API_ISSUER     issuer UUID
#   APPLE_API_KEY        key id (the AuthKey_<id>.p8 base name)
#   APPLE_API_KEY_PATH   absolute path to the AuthKey_<id>.p8
#
# Each TestFlight upload needs a unique, increasing build number — this script
# bumps src-tauri/tauri.conf.json bundle.iOS.bundleVersion before building.
#
# Usage:
#   scripts/release-testflight.sh --check      # verify cert + API creds + tooling; build nothing
#   scripts/release-testflight.sh --dry-run    # bump build no., build + validate the .ipa; NO upload
#   scripts/release-testflight.sh              # build + upload to App Store Connect → TestFlight
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CONF="src-tauri/tauri.conf.json"
IPA="src-tauri/gen/apple/build/arm64/Telstar.ipa"
BUNDLE_ID="org.hisgarden.telstar"

fail() { echo "error: $*" >&2; exit 1; }
note() { echo "•  $*"; }
step() { echo; echo "=== $* ==="; }

MODE="release"; ENV_FILE=".env.release"
for arg in "$@"; do
  case "$arg" in
    --check)      MODE="check" ;;
    --dry-run)    MODE="dry-run" ;;
    --env-file=*) ENV_FILE="${arg#*=}" ;;
    -h|--help)    grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)            fail "unknown argument: $arg" ;;
  esac
done

if [ -f "$ENV_FILE" ]; then
  note "sourcing $ENV_FILE"
  set -a; # shellcheck source=/dev/null
  . "./$ENV_FILE"; set +a
fi

# ── Preflight ────────────────────────────────────────────────────────────────
step "Preflight — $MODE"
for t in bun xcrun jq security; do command -v "$t" >/dev/null || fail "missing tool: $t"; done
note "tooling present"

security find-identity -v -p codesigning 2>/dev/null | grep -qF "Apple Distribution" \
  || fail "no 'Apple Distribution' certificate in the keychain (App Store signing needs it)"
note "Apple Distribution certificate present"

# App Store Connect API key — auto-detect from the default location (where
# altool already looks). Only the issuer UUID must be provided; the key id is
# the AuthKey_<id>.p8 base name. Explicit env vars win.
DEFAULT_KEY_DIR="$HOME/.appstoreconnect/private_keys"
if [ -z "${APPLE_API_KEY:-}" ]; then
  _k="$(ls "$DEFAULT_KEY_DIR"/AuthKey_*.p8 2>/dev/null | head -1 || true)"
  [ -n "$_k" ] && APPLE_API_KEY="$(basename "$_k" | sed -E 's/AuthKey_(.*)\.p8/\1/')"
fi
[[ "${APPLE_API_ISSUER:-}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
  || fail "APPLE_API_ISSUER must be the App Store Connect issuer UUID (got '${APPLE_API_ISSUER:-}' — add the real one to $ENV_FILE)"
[ -n "${APPLE_API_KEY:-}" ] || fail "no AuthKey_*.p8 in $DEFAULT_KEY_DIR and APPLE_API_KEY not set"
APPLE_API_KEY_PATH="${APPLE_API_KEY_PATH:-$DEFAULT_KEY_DIR/AuthKey_${APPLE_API_KEY}.p8}"
[ -f "$APPLE_API_KEY_PATH" ] || fail "API key not found: $APPLE_API_KEY_PATH"
# Export all three so `tauri ios build` uses the API key for signing/provisioning
# (it requires the full trio in the environment, not a partial set).
export APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
note "App Store Connect API key: $APPLE_API_KEY ($APPLE_API_KEY_PATH)"

if [ "$MODE" = "check" ]; then
  step "Check complete — environment is TestFlight-ready"; exit 0
fi

# ── Bump the iOS build number (must be unique + increasing per upload) ───────
step "Bumping iOS build number"
CUR_BUILD="$(jq -r '.bundle.iOS.bundleVersion // "0"' "$CONF")"
NEXT_BUILD=$(( CUR_BUILD + 1 ))
tmp="$(mktemp)"
jq --arg v "$NEXT_BUILD" '.bundle.iOS.bundleVersion = $v' "$CONF" > "$tmp" && mv "$tmp" "$CONF"
note "bundle.iOS.bundleVersion: $CUR_BUILD → $NEXT_BUILD (commit this after a successful upload)"

# ── Build the App Store .ipa (Apple Distribution signed) ─────────────────────
step "Building App Store .ipa"
bun tauri ios build --export-method app-store-connect
[ -f "$IPA" ] || fail "expected .ipa not found: $IPA"
note "built: $IPA"

# ── Validate against App Store Connect (catches most rejections pre-upload) ──
step "Validating the .ipa with App Store Connect"
xcrun altool --validate-app --type ios --file "$IPA" \
  --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER" \
  || fail "App Store validation failed (is $BUNDLE_ID registered in App Store Connect?)"
note "validation passed"

if [ "$MODE" = "dry-run" ]; then
  step "Dry-run complete — .ipa built + validated, NOT uploaded"
  note "artifact: $IPA"
  exit 0
fi

# ── Upload to App Store Connect → TestFlight ────────────────────────────────
step "Uploading to App Store Connect (TestFlight)"
xcrun altool --upload-app --type ios --file "$IPA" \
  --apiKey "$APPLE_API_KEY" --apiIssuer "$APPLE_API_ISSUER" \
  || fail "upload failed"
note "uploaded build $NEXT_BUILD"

step "Done"
note "App Store Connect is processing the build (a few minutes); it then appears in TestFlight."
note "Add testers / a build to a test group at https://appstoreconnect.apple.com → Telstar → TestFlight."
note "Remember to commit the bundleVersion bump ($CUR_BUILD → $NEXT_BUILD)."

################################################################################
# Changelog:
# 2026-06-10  Initial: build + validate + upload the iOS app to TestFlight.
################################################################################
