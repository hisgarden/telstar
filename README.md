# Telstar

A free, open-source global TV explorer — one window onto the world's public
television. Browse channels by country, category, and language, and play them
in a clean native app on macOS and iOS.

> **Status:** Scaffold. This repository currently proves the stack end-to-end —
> one HLS stream playing inside the native shell on macOS and iOS — and pins the
> toolchain, architecture, and design principles the full product is built on.
> See [`docs/plans`](docs/plans) for the implementation plan and
> [`docs/ideas/telstar-concept.md`](docs/ideas/telstar-concept.md) for the vision.

## Install

**macOS** — via [Homebrew](https://brew.sh):

```sh
brew install --cask hisgarden/telstar/telstar
```

This pulls the latest universal build (Apple Silicon + Intel) from GitHub
Releases. It is Developer-ID-signed and notarized, so it opens without any
Gatekeeper override. Upgrade later with `brew upgrade --cask telstar`.

Maintainers: the release process is documented in
[`docs/release-macos.md`](docs/release-macos.md).

## Stack

- **[Vidstack](https://vidstack.io)** — media player web components (MIT).
- **[hls.js](https://github.com/video-dev/hls.js)** — HLS adaptive-bitrate playback (Apache-2.0), bundled locally.
- **[Lit](https://lit.dev)** + **[@lit-labs/signals](https://lit.dev/docs/data/signals/)** — web-component UI with signal-driven reactive state.
- **[Tauri 2](https://v2.tauri.app)** — native macOS + iOS packaging from a single web codebase (WKWebView).
- **[Bun](https://bun.sh)** — package manager, runtime, and test runner.

## Design principles

- **Behavior-driven** — specs describe observable behavior (Given/When/Then); feature code is written test-first.
- **Zero trust** — playlists and stream URLs are untrusted data, never code: scheme-allowlisted sources, a tightly scoped Content-Security-Policy, and a minimal native capability set.
- **Privacy, local-first** — all user data stays on-device by default; no account, no telemetry. Any cloud sync is strictly opt-in. See [`docs/architecture/data-and-privacy.md`](docs/architecture/data-and-privacy.md).
- **Minimal dependencies** — only the core stack; a CycloneDX SBOM is committed under [`sbom/`](sbom).

## Prerequisites

- [Bun](https://bun.sh) (package manager, runtime, tests)
- [Rust](https://rustup.rs) via `rustup` (the Tauri native core)
- [Xcode](https://developer.apple.com/xcode/) (macOS app and iOS builds)

## Development

```sh
bun install            # install dependencies
bun run tauri dev      # run the native macOS app (hot-reloads the frontend)
bun test               # run the test suite
bun run build          # type-check and build the web frontend
```

Or via [Task](https://taskfile.dev):

```sh
task dev               # native macOS app
task test              # test suite
task build             # production build (web + native)
```

## iOS

```sh
bun run tauri ios init # one-time: generate the Xcode project under src-tauri/gen/apple
bun run tauri ios dev  # build and run on the iOS Simulator
```

Simulator builds need only a development signing identity; running on a
physical device additionally requires an Apple Developer account and
provisioning profile.

## Privacy & Security

- **Local-first, no account.** User data stays on-device; the app needs no
  account or Apple ID and works fully offline. iCloud sync, if added, is
  strictly opt-in (CloudKit private database).
- **No telemetry.** No analytics, crash-reporting, or update beacons. The only
  network egress is the stream/playlist URLs you provide; hls.js is bundled
  locally rather than fetched from a CDN.
- **Zero trust.** Stream URLs are scheme-allowlisted before playback, the
  Content-Security-Policy is scoped to the active stream host (never `*`), and
  the native capability set is `core:default` only.
- **Auditable supply chain.** CycloneDX SBOMs for the JS and Rust trees are
  committed under [`sbom/`](sbom) and regenerated with `task sbom`.

Full detail: [`docs/architecture/data-and-privacy.md`](docs/architecture/data-and-privacy.md).

## License

[MIT](LICENSE) © 2026 hisgarden
