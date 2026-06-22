/**
 * iCloud sync orchestration. Mirrors the viewer's personal state to their
 * *private* iCloud key-value store through the native bridge
 * (src-tauri/src/icloud.rs), and merges inbound changes back on launch.
 *
 * Per-state-type conflict policy (plan KTD-5):
 *   - Sets (favorites, hidden, recents): additive **union** — adds propagate,
 *     removals do not (no tombstones). Recents keep their cap after merge.
 *   - Scalars (locale, captions, flags, playable-only): **last-writer-wins**,
 *     resolved by the key-value store itself; on pull we adopt its value.
 *
 * Gated by `syncEnabled` (default on). When off, or on a non-Apple/browser
 * build, every path is a complete no-op. The pure merge helpers are unit-tested;
 * the I/O wrapper is verified on-device.
 *
 * This module deliberately does NOT import the signal store — `pull()` returns a
 * plain snapshot and the caller (main.ts) applies it, so there is no import
 * cycle with state/signals.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriAvailable } from "./ingest";
import { loadSyncEnabled } from "./state/view-pref";
import type { SyncedVerdicts } from "./model/verdicts";

/** A minimal key-value store: opaque string keys → JSON-string values. */
export interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  sync(): Promise<boolean>;
}

/** Native store backed by the iCloud KVS bridge. */
const nativeKvStore: KvStore = {
  get: (key) => invoke<string | null>("kv_get", { key }),
  set: (key, value) => invoke<void>("kv_set", { key, value }),
  remove: (key) => invoke<void>("kv_remove", { key }),
  keys: () => invoke<string[]>("kv_keys"),
  sync: () => invoke<boolean>("kv_sync"),
};

/** No-op store for the browser/dev build and tests. */
const noopKvStore: KvStore = {
  get: async () => null,
  set: async () => {},
  remove: async () => {},
  keys: async () => [],
  sync: async () => false,
};

/** The active store: native in the app, no-op everywhere else. */
export function kvStore(): KvStore {
  return isTauriAvailable() ? nativeKvStore : noopKvStore;
}

/** Sync is a no-op unless we're in the native app AND the user left it enabled. */
export function syncActive(): boolean {
  return isTauriAvailable() && loadSyncEnabled();
}

// ---- Pure merge helpers (unit-tested) -------------------------------------

/** Additive union: local order preserved, remote-only items appended, deduped. */
export function mergeSet(local: string[], remote: string[]): string[] {
  const seen = new Set(local);
  const out = [...local];
  for (const x of remote) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/** Last-writer-wins: adopt the remote value when present, else keep local. */
export function mergeScalar<T>(local: T, remote: T | null | undefined): T {
  return remote == null ? local : remote;
}

/** Keep at most the first `cap` items (lists are most-recent-first). */
export function capList(list: string[], cap: number): string[] {
  return list.length > cap ? list.slice(0, cap) : list;
}

// ---- Keys -----------------------------------------------------------------

/** iCloud KVS keys. `verdicts:<cacheKey>` keys (U3) live outside this map. */
export const SYNC_KEYS = {
  favorites: "telstar.sync.favorites",
  hidden: "telstar.sync.hidden",
  recents: "telstar.sync.recents",
  locale: "telstar.sync.locale",
  captionsOn: "telstar.sync.captionsOn",
  showFlags: "telstar.sync.showFlags",
  playableOnly: "telstar.sync.playableOnly",
} as const;

// ---- Push (mirror local change → iCloud) ----------------------------------

async function writeJson(key: string, value: unknown): Promise<void> {
  if (!syncActive()) return;
  try {
    await kvStore().set(key, JSON.stringify(value));
  } catch {
    /* iCloud unavailable; local state is still authoritative */
  }
}

export const pushFavorites = (keys: string[]) => writeJson(SYNC_KEYS.favorites, keys);
export const pushHidden = (urls: string[]) => writeJson(SYNC_KEYS.hidden, urls);
export const pushRecents = (urls: string[]) => writeJson(SYNC_KEYS.recents, urls);
export const pushLocale = (code: string) => writeJson(SYNC_KEYS.locale, code);
export const pushCaptionsOn = (on: boolean) => writeJson(SYNC_KEYS.captionsOn, on);
export const pushShowFlags = (on: boolean) => writeJson(SYNC_KEYS.showFlags, on);
export const pushPlayableOnly = (on: boolean) => writeJson(SYNC_KEYS.playableOnly, on);

// ---- Pull (iCloud → snapshot the caller applies) --------------------------

/** A snapshot of inbound synced state; only keys present in iCloud are set. */
export interface SyncSnapshot {
  favorites?: string[];
  hidden?: string[];
  recents?: string[];
  locale?: string;
  captionsOn?: boolean;
  showFlags?: boolean;
  playableOnly?: boolean;
}

// ---- Verdict sync (per source) --------------------------------------------

/** iCloud key for a source's availability verdicts (keyed by its cache key). */
export const verdictKey = (cacheKey: string) => `verdicts:${cacheKey}`;

/** Index of synced verdict sources → their scan time, for LRU size-guarding. */
const VERDICT_INDEX_KEY = "telstar.sync.verdictIndex";

/**
 * Cap on synced verdict *sources*. A safety backstop well under the KVS limits
 * (~1 MB total / 1024 keys); real usage is a handful of sources. Beyond the cap
 * the least-recently-scanned sources are dropped (logged, never silent).
 */
const MAX_VERDICT_SOURCES = 12;

/**
 * Choose which sources to evict: the oldest-scanned beyond `maxSources`. Pure
 * and idempotent — re-running on the survivors evicts nothing. (Exported for
 * tests.)
 */
export function selectEvictions(index: Record<string, number>, maxSources: number): string[] {
  const keys = Object.keys(index);
  if (keys.length <= maxSources) return [];
  const oldestFirst = [...keys].sort((a, b) => (index[a] ?? 0) - (index[b] ?? 0));
  return oldestFirst.slice(0, keys.length - maxSources);
}

async function readVerdictIndex(store: KvStore): Promise<Record<string, number>> {
  try {
    const raw = await store.get(VERDICT_INDEX_KEY);
    if (raw == null) return {};
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object") return {};
    const out: Record<string, number> = {};
    for (const [k, t] of Object.entries(v)) if (typeof t === "number") out[k] = t;
    return out;
  } catch {
    return {};
  }
}

/**
 * Mirror a source's coded verdicts to iCloud (gated, best-effort), maintaining
 * the source index and evicting LRU sources past the cap.
 */
export async function pushVerdicts(cacheKey: string, synced: SyncedVerdicts): Promise<void> {
  if (!syncActive()) return;
  try {
    const store = kvStore();
    await store.set(verdictKey(cacheKey), JSON.stringify(synced));
    const index = await readVerdictIndex(store);
    index[cacheKey] = synced.scannedAt;
    const evicted = selectEvictions(index, MAX_VERDICT_SOURCES);
    for (const k of evicted) {
      delete index[k];
      await store.remove(verdictKey(k));
    }
    if (evicted.length > 0) {
      console.info(`[sync] evicted ${evicted.length} LRU verdict source(s): ${evicted.join(", ")}`);
    }
    await store.set(VERDICT_INDEX_KEY, JSON.stringify(index));
  } catch {
    /* iCloud unavailable; local cache is still authoritative */
  }
}

/** Pull a source's synced verdicts, or null when absent/off/malformed. */
export async function pullVerdicts(
  cacheKey: string,
  store: KvStore = kvStore(),
): Promise<SyncedVerdicts | null> {
  if (!syncActive()) return null;
  try {
    const raw = await store.get(verdictKey(cacheKey));
    if (raw == null) return null;
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && typeof v.scannedAt === "number" && v.map && typeof v.map === "object") {
      return v as SyncedVerdicts;
    }
    return null;
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null, guard: (v: unknown) => v is T): T | undefined {
  if (raw == null) return undefined;
  try {
    const v = JSON.parse(raw);
    return guard(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const isString = (v: unknown): v is string => typeof v === "string";
const isBool = (v: unknown): v is boolean => typeof v === "boolean";

/** Pull the synced personal state from iCloud. No-op (empty) when sync is off. */
export async function pull(store: KvStore = kvStore()): Promise<SyncSnapshot> {
  if (!syncActive()) return {};
  try {
    await store.sync();
    const [fav, hid, rec, loc, cap, flg, ply] = await Promise.all([
      store.get(SYNC_KEYS.favorites),
      store.get(SYNC_KEYS.hidden),
      store.get(SYNC_KEYS.recents),
      store.get(SYNC_KEYS.locale),
      store.get(SYNC_KEYS.captionsOn),
      store.get(SYNC_KEYS.showFlags),
      store.get(SYNC_KEYS.playableOnly),
    ]);
    return {
      favorites: parse(fav, isStringArray),
      hidden: parse(hid, isStringArray),
      recents: parse(rec, isStringArray),
      locale: parse(loc, isString),
      captionsOn: parse(cap, isBool),
      showFlags: parse(flg, isBool),
      playableOnly: parse(ply, isBool),
    };
  } catch {
    return {};
  }
}
