/**
 * iptv-org metadata cache wrapper (R3). The native core caches the full
 * channels/feeds DB on-device and returns only the records matching the loaded
 * channels (pruned), so enrichment never transfers the full ~17 MB. No-ops in
 * the browser preview.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriAvailable } from "./ingest";
import { isStale } from "./state/availability";

/** Refresh the cached metadata at most weekly. */
export const METADATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Raw matched records for the frontend to index + join. */
export interface MetadataLookup {
  channels: unknown[];
  feeds: unknown[];
}

const EMPTY: MetadataLookup = { channels: [], feeds: [] };

/**
 * Ensure the metadata cache exists and is fresh (fetch if missing/stale).
 * Returns true if metadata is available to look up, false otherwise (e.g. the
 * browser preview, or a failed fetch).
 */
export async function ensureMetadata(now: number = Date.now()): Promise<boolean> {
  if (!isTauriAvailable()) return false;
  try {
    const age = await invoke<number | null>("metadata_age");
    if (isStale(age, now, METADATA_TTL_MS)) await invoke("fetch_metadata");
    return true;
  } catch {
    return false;
  }
}

/** Look up cached channel/feed records for the given channel ids (pruned). */
export async function lookupMetadata(ids: string[]): Promise<MetadataLookup> {
  if (!isTauriAvailable()) return EMPTY;
  try {
    return await invoke<MetadataLookup>("lookup_metadata", { ids });
  } catch {
    return EMPTY;
  }
}
