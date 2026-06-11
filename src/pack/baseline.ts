/**
 * Bundled baseline pack loader.
 *
 * The curated World News pack ships as a static asset under `public/packs/`,
 * served by Vite at `/packs/world-news.json` and read inside the Tauri
 * WebView. It is the offline / first-run source of truth; the deferred remote
 * manifest (U4) will overlay corrections on top. Loading is best-effort —
 * any failure degrades to an empty pack rather than throwing, so the rest of
 * the app is unaffected.
 *
 * NOTE (curation): the stream URLs in the baseline JSON are official-domain
 * endpoints but require periodic liveness verification (see docs/curation.md).
 * Liveness is a curation-time concern, not something this loader asserts.
 */
import { parsePack, type PackManifest } from "../model/pack";

export const BASELINE_PACK_URL = "/packs/world-news.json";
/** The featured FIFA+ sports pack — its own bundled manifest (sibling to World News). */
export const FIFA_PACK_URL = "/packs/fifa-plus.json";

const EMPTY: PackManifest = { version: 0, channels: [], removed: [] };

/** Load + parse a bundled pack manifest from a static URL. Empty manifest on any failure. */
export async function loadPackFrom(url: string): Promise<PackManifest> {
  try {
    const res = await fetch(url);
    if (!res.ok) return EMPTY;
    return parsePack(await res.json()) ?? EMPTY;
  } catch {
    return EMPTY;
  }
}
