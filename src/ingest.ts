/**
 * Playlist ingestion — the frontend's thin boundary over the native core's
 * file/URL I/O. Components depend on this module, not on Tauri IPC directly.
 *
 * Zero-trust (R6): the URL path validates the scheme against the shared
 * allowlist before invoking the native fetch — a rejected URL never reaches
 * the network. The native core enforces the same rule (defense in depth).
 */
import { invoke } from "@tauri-apps/api/core";
import { isAllowedSource } from "./state/source";

export interface PlaylistFile {
  path: string;
  text: string;
}

export class DisallowedSourceError extends Error {}
export class TauriUnavailableError extends Error {}

/**
 * Whether the native Tauri runtime is present. False in the plain browser dev
 * server, where the file/URL commands cannot run. The web build is dev/demo
 * only; loading playlists requires the desktop app.
 */
export function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function assertTauri(): void {
  if (!isTauriAvailable()) {
    throw new TauriUnavailableError(
      "Loading playlists needs the Telstar desktop app — run `bun run tauri dev`. The browser preview can't reach the native file picker or fetch.",
    );
  }
}

/**
 * Open the native file picker for `.m3u`/`.m3u8` and read the chosen file.
 * Resolves to the file's path + text, or `null` if the user cancels.
 */
export function pickPlaylistFile(): Promise<PlaylistFile | null> {
  try {
    assertTauri();
  } catch (err) {
    return Promise.reject(err);
  }
  return invoke<PlaylistFile | null>("pick_playlist_file");
}

/**
 * Fetch playlist text from an http(s) URL via the native core (CORS-safe).
 * Rejects with DisallowedSourceError before any request if the scheme is not
 * on the allowlist.
 */
export function fetchPlaylistText(url: string): Promise<string> {
  if (!isAllowedSource(url)) {
    return Promise.reject(
      new DisallowedSourceError(`Rejected playlist URL (scheme not allowed): ${url}`),
    );
  }
  try {
    assertTauri();
  } catch (err) {
    return Promise.reject(err);
  }
  return invoke<string>("fetch_playlist", { url });
}
