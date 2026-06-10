/**
 * On-device persistence of scanned playlists (R8), keyed by source so each
 * language/region is cached separately. The native core does plain string I/O
 * to one JSON file in the app data dir; the document shape lives here in TS.
 *
 * Optimization: a source is scanned once and cached. Re-selecting a language
 * loads its cached scan instantly (no re-fetch, no re-probe); the Refresh
 * action forces a new scan. Reopening hydrates the most-recent source.
 *
 * Resilience: a missing/corrupt file (or the legacy v1 single-store shape)
 * degrades to empty rather than throwing.
 */
import { invoke } from "@tauri-apps/api/core";
import type { Channel } from "./model/channel";

// v3: prior versions could cross-contaminate a source's cache if the user
// switched language mid-scan; discard them so caches rebuild cleanly.
const STORE_VERSION = 3;

export interface CachedScan {
  /** The playlist source (file path or URL). */
  source: string;
  /** Region filter (tvg-id country suffixes) for sliced sources like English (US); null otherwise. */
  idCountries: string[] | null;
  /** The scanned channels (including availability). */
  channels: Channel[];
  /** Epoch ms of the scan, or null if never scanned. */
  scannedAt: number | null;
}

interface StoreFile {
  version: number;
  lastKey: string | null;
  entries: Record<string, CachedScan>;
}

const emptyFile = (): StoreFile => ({ version: STORE_VERSION, lastKey: null, entries: {} });

/**
 * Cache key for a loaded source. Includes the region filter so the three
 * English regions (same eng.m3u URL, different country slices) cache apart.
 */
export function cacheKey(source: string, idCountries?: string[] | null): string {
  return idCountries && idCountries.length
    ? `${source}#${[...idCountries].sort().join(",")}`
    : source;
}

/** Parse the persisted store file; tolerant of corruption and the legacy v1 shape. */
export function parseStoreFile(json: string | null): StoreFile {
  if (json == null) return emptyFile();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return emptyFile();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyFile();
  const obj = parsed as Record<string, unknown>;
  // Only honor the current version; older caches are discarded (rebuild clean).
  if (obj.version !== STORE_VERSION) return emptyFile();
  const entries =
    typeof obj.entries === "object" && obj.entries
      ? (obj.entries as Record<string, CachedScan>)
      : {};
  const lastKey = typeof obj.lastKey === "string" ? obj.lastKey : null;
  return { version: STORE_VERSION, lastKey, entries };
}

async function readFile(): Promise<StoreFile> {
  try {
    return parseStoreFile(await invoke<string | null>("load_store"));
  } catch {
    return emptyFile();
  }
}

async function writeFile(file: StoreFile): Promise<void> {
  try {
    await invoke("save_store", { json: JSON.stringify(file) });
  } catch {
    /* native-only; no-op in the browser preview */
  }
}

/** The cached scan for a source key, or null if not cached. */
export async function loadCachedScan(key: string): Promise<CachedScan | null> {
  return (await readFile()).entries[key] ?? null;
}

/** Save a scanned source and mark it most-recent (for startup hydrate). */
export async function saveCachedScan(key: string, scan: CachedScan): Promise<void> {
  const file = await readFile();
  file.entries[key] = scan;
  file.lastKey = key;
  await writeFile(file);
}

/** The most-recently-loaded cached scan (startup hydrate), or null. */
export async function loadLastScan(): Promise<CachedScan | null> {
  const file = await readFile();
  return file.lastKey ? (file.entries[file.lastKey] ?? null) : null;
}
