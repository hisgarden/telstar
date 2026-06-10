#!/usr/bin/env bash
#
# cleanup-build.sh — reclaim disk space from telstar build artifacts.
#
# All targets are regenerable: Rust target/, Xcode DerivedData, generated
# iOS/macOS build output, simulator state, and dev tool caches. No source,
# config, or media is ever touched.
#
# Usage:
#   ./scripts/cleanup-build.sh           # clean telstar build artifacts (default)
#   ./scripts/cleanup-build.sh --all     # also erase simulators + clear iOS DeviceSupport + brew cleanup
#   ./scripts/cleanup-build.sh --dry-run # show what would be freed, delete nothing
#   ./scripts/cleanup-build.sh --yes     # skip the confirmation prompt
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI="$REPO_ROOT/src-tauri"

DRY_RUN=0
DEEP=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --all)     DEEP=1 ;;
    --yes|-y)  ASSUME_YES=1 ;;
    -h|--help) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

free_space() { df -H /System/Volumes/Data | awk 'NR==2{print $4" free"}'; }
size_of()    { [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "0B"; }

# A cleanup target: human label + path to remove.
targets=(
  "Rust target/|$TAURI/target"
  "iOS build (gen/apple/build)|$TAURI/gen/apple/build"
  "iOS externals (gen/apple/Externals)|$TAURI/gen/apple/Externals"
  "Pods (gen/apple/Pods)|$TAURI/gen/apple/Pods"
)

# Xcode DerivedData entries belonging to telstar (hashed dir names).
for dd in "$HOME/Library/Developer/Xcode/DerivedData/"*telstar* \
          "$HOME/Library/Developer/Xcode/DerivedData/"*Telstar*; do
  [ -e "$dd" ] && targets+=("DerivedData ($(basename "$dd"))|$dd")
done

echo "telstar build cleanup  —  $(free_space)"
echo "----------------------------------------"
total_listed=0
for t in "${targets[@]}"; do
  label="${t%%|*}"; path="${t#*|}"
  [ -e "$path" ] || continue
  printf "  %-40s %s\n" "$label" "$(size_of "$path")"
done

if [ "$DEEP" -eq 1 ]; then
  echo "  -- deep (--all) --"
  printf "  %-40s %s\n" "iOS DeviceSupport (all devices)" "$(size_of "$HOME/Library/Developer/Xcode/iOS DeviceSupport")"
  printf "  %-40s %s\n" "Simulators (erase to factory)" "(per-device app data)"
  printf "  %-40s %s\n" "Homebrew cache" "$(size_of "$HOME/Library/Caches/Homebrew")"
fi
echo "----------------------------------------"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run: nothing deleted."
  exit 0
fi

if [ "$ASSUME_YES" -eq 0 ]; then
  read -r -p "Delete the above regenerable artifacts? [y/N] " ans
  case "$ans" in y|Y|yes|YES) ;; *) echo "aborted."; exit 0 ;; esac
fi

for t in "${targets[@]}"; do
  path="${t#*|}"
  [ -e "$path" ] && rm -rf "$path" && echo "removed: ${t%%|*}"
done

if [ "$DEEP" -eq 1 ]; then
  if command -v xcrun >/dev/null 2>&1; then
    xcrun simctl shutdown all 2>/dev/null || true
    xcrun simctl erase all 2>/dev/null && echo "simulators erased"
  fi
  rm -rf "$HOME/Library/Developer/Xcode/iOS DeviceSupport/"* 2>/dev/null && echo "iOS DeviceSupport cleared"
  command -v brew >/dev/null 2>&1 && brew cleanup -s >/dev/null 2>&1 && echo "homebrew cache cleaned"
fi

echo "----------------------------------------"
echo "done  —  $(free_space)  (more reclaims as APFS purgeable space settles)"
