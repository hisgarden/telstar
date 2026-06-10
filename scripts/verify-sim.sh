#!/usr/bin/env bash
#
# verify-sim.sh — prove the iOS simulator runtime boots and renders.
#
# Run after an Xcode or macOS update (e.g. moving to 26.5) to confirm the
# simulator runtime still works end-to-end: present -> boot -> render -> shutdown.
# Exits 0 on PASS, non-zero on FAIL.
#
set -uo pipefail

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "=== Host ==="
sw_vers
xcodebuild -version 2>/dev/null | head -1 || fail "Xcode not found"
echo

echo "=== Runtime present & Ready ==="
RT="$(xcrun simctl runtime list 2>/dev/null | grep -i 'iOS' | grep -i 'Ready' | head -1)"
[ -n "$RT" ] || fail "no Ready iOS runtime (run: xcrun simctl runtime list)"
echo "$RT"
echo

# Pick the first available iOS device (any iPhone, else any device under an iOS section).
# awk only selects the line; grep -oE extracts the UDID (portable to BSD/macOS awk).
UUID_RE='[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}'
DEV="$(xcrun simctl list devices available 2>/dev/null \
  | awk '/-- iOS /{f=1;next} /^-- /{f=0} f && /iPhone/{print; exit}' | grep -oE "$UUID_RE" | head -1)"
[ -n "${DEV:-}" ] || DEV="$(xcrun simctl list devices available 2>/dev/null \
  | awk '/-- iOS /{f=1;next} /^-- /{f=0} f{print; exit}' | grep -oE "$UUID_RE" | head -1)"
[ -n "${DEV:-}" ] || fail "no available iOS simulator device"
echo "=== Booting device $DEV ==="

xcrun simctl boot "$DEV" 2>/dev/null
trap 'xcrun simctl shutdown "$DEV" >/dev/null 2>&1' EXIT
timeout 120 xcrun simctl bootstatus "$DEV" 2>&1 | tail -1
STATE="$(xcrun simctl list devices 2>/dev/null | grep "$DEV" | grep -o '(Booted)' || true)"
[ "$STATE" = "(Booted)" ] || fail "device did not reach Booted state"
echo "state: Booted"
echo

echo "=== Render test (screenshot) ==="
OUT="$(mktemp -t sim_verify).png"
xcrun simctl io "$DEV" screenshot "$OUT" >/dev/null 2>&1 || fail "screenshot capture failed"
SZ=$(stat -f '%z' "$OUT" 2>/dev/null || echo 0)
rm -f "$OUT"
[ "$SZ" -gt 1000 ] || fail "screenshot empty ($SZ bytes) — runtime not rendering"
echo "captured ${SZ} bytes — renderer alive"
echo

echo "PASS: simulator runtime boots and renders."
