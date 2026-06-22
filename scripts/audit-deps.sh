#!/usr/bin/env bash
#
# audit-deps.sh — pre-release supply-chain gate.
#
# Downloads the exact dependency tree, generates CycloneDX SBOMs, and scans them
# for known vulnerabilities against the OSV database (npm + crates.io / RustSec
# in one pass). Exits non-zero on any UNTRIAGED advisory, so releases gate on it.
#
# Triaged-and-accepted advisories live in osv-scanner.toml at the repo root, each
# with a written justification and an expiry date. The gate fails on anything NOT
# listed there — a new or untriaged finding blocks the release for human review.
#
# Split into phases so the Taskfile can fingerprint them independently — SBOM
# generation is skipped when the lockfiles haven't changed, while the OSV scan
# ALWAYS runs (the vulnerability database updates daily; a scan that passed
# yesterday can fail today against the same SBOM):
#
#   scripts/audit-deps.sh             # full: deps + SBOMs (throwaway) + scan
#   scripts/audit-deps.sh gen <dir>   # deps + generate SBOMs into <dir>
#   scripts/audit-deps.sh scan <dir>  # scan the SBOMs in <dir> (no generation)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Use the rustup toolchain for `cargo metadata` (cdxgen shells out to it), kept
# consistent with the builds. (See memory: rust-toolchain-shadowing.)
[ -x "$HOME/.cargo/bin/cargo" ] && export PATH="$HOME/.cargo/bin:$PATH"

fail() { echo "error: $*" >&2; exit 1; }
note() { echo "•  $*"; }
step() { echo; echo "=== $* ==="; }

CONFIG="osv-scanner.toml"

gen_sboms() {  # $1 = output dir
  local dir="$1"
  command -v bun >/dev/null || fail "missing tool: bun"
  mkdir -p "$dir"
  step "Downloading dependencies (frozen lockfile)"
  bun install --frozen-lockfile
  note "dependencies present"
  step "Generating CycloneDX SBOMs (JS + Rust) → $dir"
  # NB: no FETCH_LICENSE. Vulnerability matching keys on package coordinates
  # (purl: name + version), not license text — and the per-package license
  # lookups make a network call each, which hangs/throttles on locked-down Macs.
  # The `sbom` task keeps FETCH_LICENSE for the *published* artifact.
  bunx @cyclonedx/cdxgen@11 -t javascript --lifecycle pre-build --no-recurse -o "$dir/telstar-js.cdx.json" .
  bunx @cyclonedx/cdxgen@11 -t rust --no-recurse -o "$dir/telstar-rust.cdx.json" src-tauri
  note "SBOMs generated"
}

scan_sboms() {  # $1 = dir containing the SBOMs
  local dir="$1" js="$1/telstar-js.cdx.json" rust="$1/telstar-rust.cdx.json" code
  command -v osv-scanner >/dev/null || fail "missing tool: osv-scanner"
  [ -f "$CONFIG" ] || fail "missing $CONFIG (the triaged suppression allowlist) — refusing to scan without it"
  [ -f "$js" ]   || fail "missing $js — run: scripts/audit-deps.sh gen $dir"
  [ -f "$rust" ] || fail "missing $rust — run: scripts/audit-deps.sh gen $dir"
  step "Scanning SBOMs for known vulnerabilities (OSV)"
  # Capture osv-scanner's OWN exit code: 0 = clean, 1 = untriaged findings,
  # other = scan error. PIPESTATUS keeps it through the tee.
  set +e
  osv-scanner scan --config "$CONFIG" --sbom "$js" --sbom "$rust" 2>&1 | tee /tmp/telstar-osv.out
  code="${PIPESTATUS[0]}"
  set -e
  echo
  case "$code" in
    0) note "supply-chain gate PASSED — no untriaged advisories" ;;
    1) fail "supply-chain gate FAILED — untriaged advisory found above.
   Fix the dependency, or (if a justified false positive) add it to $CONFIG
   with a reason + ignoreUntil date, then re-run." ;;
    *) fail "osv-scanner errored (exit $code) — see output above (network/DB issue?)" ;;
  esac
}

CMD="${1:-full}"
case "$CMD" in
  gen)
    [ -n "${2:-}" ] || fail "usage: audit-deps.sh gen <output-dir>"
    gen_sboms "$2"
    ;;
  scan)
    [ -n "${2:-}" ] || fail "usage: audit-deps.sh scan <sbom-dir>"
    scan_sboms "$2"
    ;;
  full)
    SCAN_DIR="$(mktemp -d)"
    trap 'rm -rf "$SCAN_DIR"' EXIT
    gen_sboms "$SCAN_DIR"
    scan_sboms "$SCAN_DIR"
    ;;
  -h|--help)
    grep '^#' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    fail "unknown command: $CMD (gen <dir> | scan <dir> | no args for full)"
    ;;
esac

################################################################################
# Changelog:
# 2026-06-10  Split into gen/scan phases for Taskfile fingerprint caching.
# 2026-06-10  Initial pre-release supply-chain gate: deps + SBOM + OSV scan.
################################################################################
