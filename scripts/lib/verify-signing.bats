#!/usr/bin/env bats
#
# Unit tests for verify_app_signing (scripts/lib/verify-signing.sh).
#
# The function shells out to codesign / xcrun stapler / spctl. To keep the test
# portable (no real Developer-ID-notarized app, runs in CI), those three tools
# are STUBBED via PATH so each test drives the control flow with controlled exit
# codes. We assert the function fails on the FIRST failing gate and only passes
# when codesign AND the .app's own staple AND the Gatekeeper exec verdict pass.

setup() {
  LIB="${BATS_TEST_DIRNAME}/verify-signing.sh"
  STUBDIR="$(mktemp -d)"
  APPPARENT="$(mktemp -d)"
  APP="$APPPARENT/Fake.app"; mkdir -p "$APP"   # must look like a bundle directory
  # Default: every gate succeeds.
  _stub codesign 0
  _stub xcrun 0
  _stub spctl 0
  PATH="$STUBDIR:$PATH"
  # shellcheck source=/dev/null
  source "$LIB"
}

teardown() { rm -rf "$STUBDIR" "$APPPARENT"; }

# _stub <tool-name> <exit-code> — drop an executable stub earliest on PATH.
_stub() {
  printf '#!/bin/sh\nexit %s\n' "$2" > "$STUBDIR/$1"
  chmod +x "$STUBDIR/$1"
}

@test "passes when codesign, the .app staple, and spctl exec all succeed" {
  run verify_app_signing "$APP"
  [ "$status" -eq 0 ]
}

@test "fails when the .app itself is not stapled (the 'damaged'-on-extraction case)" {
  _stub xcrun 1
  run verify_app_signing "$APP"
  [ "$status" -eq 1 ]
  [[ "$output" == *"NOT stapled"* ]]
}

@test "fails when Gatekeeper rejects the exec assessment" {
  _stub spctl 1
  run verify_app_signing "$APP"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Gatekeeper REJECTS"* ]]
}

@test "fails when codesign verification fails" {
  _stub codesign 1
  run verify_app_signing "$APP"
  [ "$status" -eq 1 ]
  [[ "$output" == *"codesign verify FAILED"* ]]
}

@test "errors (exit 2) when the path is not a bundle directory" {
  run verify_app_signing "/no/such/Telstar.app"
  [ "$status" -eq 2 ]
}

@test "errors (exit 2) when no path is given" {
  run verify_app_signing ""
  [ "$status" -eq 2 ]
}

################################################################################
# Changelog:
# 2026-06-15  Initial: unit tests for verify_app_signing via PATH-stubbed tools.
################################################################################
