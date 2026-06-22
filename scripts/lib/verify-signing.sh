#!/usr/bin/env bash
#
# verify-signing.sh — reusable Gatekeeper/notarization assertions for a built .app.
#
# Sourced by release-macos.sh (and unit-tested in isolation via verify-signing.bats).
# The check exists because Homebrew distributes the .app COPIED OUT of the DMG, so
# the .app's OWN notarization staple — not just the DMG container's — is what an
# end-user's Mac evaluates at launch. A build that staples the DMG but leaves the
# nested .app unstapled passes a DMG-only check yet shows, on every user's machine:
#
#     "<app>" is damaged and can't be opened. You should move it to the Trash.
#
# These functions fail loud (non-zero + a stderr message) so the release aborts
# BEFORE publishing such an artifact.

# verify_app_signing <app_path>
#   Asserts, in order, that the .app:
#     1. passes codesign --verify --deep --strict   (signature intact)
#     2. has its OWN stapled notarization ticket     (offline Gatekeeper pass)
#     3. is accepted by Gatekeeper's exec assessment (spctl -a -t exec)
#   Returns 0 if all pass, 1 on the first failed gate, 2 on a usage/arg error.
verify_app_signing() {
  local app="${1:-}"
  [ -n "$app" ]  || { echo "verify_app_signing: no app path given" >&2; return 2; }
  [ -d "$app" ]  || { echo "verify_app_signing: not a bundle directory: $app" >&2; return 2; }

  codesign --verify --deep --strict --verbose=2 "$app" 2>/dev/null \
    || { echo "verify_app_signing: codesign verify FAILED on $app" >&2; return 1; }

  # The .app's OWN staple. brew ships the extracted .app, so a DMG-only staple is
  # not enough — without this the extracted copy shows "damaged" on first launch.
  xcrun stapler validate "$app" >/dev/null 2>&1 \
    || { echo "verify_app_signing: .app is NOT stapled — extracted copy will show 'damaged': $app" >&2; return 1; }

  # Gatekeeper's own execution assessment must accept it.
  spctl --assess --type exec "$app" 2>/dev/null \
    || { echo "verify_app_signing: Gatekeeper REJECTS the .app (spctl exec) — would ship 'damaged': $app" >&2; return 1; }

  return 0
}

################################################################################
# Changelog:
# 2026-06-15  Initial: verify_app_signing asserts the extracted .app's own staple
#             + Gatekeeper exec verdict (brew ships the .app, not the DMG).
################################################################################
