/**
 * Reactive state store — the single source of truth for what is playing.
 *
 * This module is the isolation boundary for `@lit-labs/signals` (experimental,
 * "not for production"). All signal definitions live here; consumers import
 * these signals, the typed setters, and the re-exported Lit integration from
 * this module — never `@lit-labs/signals` directly. If the Labs API shifts or
 * the package is swapped (e.g. for `@lit-labs/preact-signals` or core Lit
 * reactive state), the change is confined to this one file.
 *
 * Design intent (agent-native seam): the player never owns stream state.
 * Setting `currentSource` is the only way to change what plays, so the future
 * channel browser — or an agent tool — drives playback by writing one signal,
 * identical to what the UI does.
 */
import { signal, SignalWatcher, watch } from "@lit-labs/signals";
import { pushRecent } from "./recents";
import { savePlayedUrls, saveHiddenUrls } from "./view-pref";
import type { Channel } from "../model/channel";

/** Observable playback status, written back by the player. */
export type PlaybackState =
  | "idle"
  | "can-play"
  | "playing"
  | "paused"
  | "error";

export const INITIAL_PLAYBACK_STATE: PlaybackState = "idle";

/** The media source currently bound to the player. `null` means nothing loaded. */
export const currentSource = signal<string | null>(null);

/** Current playback status; mirrors the player's lifecycle events. */
export const playbackState = signal<PlaybackState>(INITIAL_PLAYBACK_STATE);

/** The loaded channels (from a parsed playlist). Empty until a playlist loads. */
export const channels = signal<Channel[]>([]);

/** Replace the loaded channel list. */
export function setChannels(list: Channel[]): void {
  channels.set(list);
}

/** Recently-selected channel URLs, most-recent first — drives "recent on top". */
export const recentUrls = signal<string[]>([]);

/** Record a channel selection: move its URL to the front of the recents list. */
export function recordSelection(url: string): void {
  recentUrls.set(pushRecent(recentUrls.get(), url));
}

/** Channels that have ACTUALLY played, most-recent first — drives the hotbar. Persisted. */
export const playedUrls = signal<string[]>([]);

/** Max channels kept in the played-hotbar (at least an 8×2 grid). */
const PLAYED_CAP = 16;

/**
 * Optional sink notified when persisted curation sets change, so the iCloud
 * sync layer can mirror them — without this module importing sync.ts (which
 * would be an import cycle). main.ts registers it when sync is active.
 */
type StateSink = (kind: "played" | "hidden", urls: string[]) => void;
let stateSink: StateSink | null = null;
export function setStateSink(sink: StateSink | null): void {
  stateSink = sink;
}

/** Hydrate the played hotbar from storage without re-persisting (startup). */
export function setPlayedUrls(urls: string[]): void {
  playedUrls.set(urls);
}

function commitPlayed(urls: string[]): void {
  playedUrls.set(urls);
  savePlayedUrls(urls);
  stateSink?.("played", urls);
}

/** Remove a channel from the played hotbar (e.g. right-click on a Recent chip). */
export function removeFromPlayed(url: string): void {
  const p = playedUrls.get();
  if (p.includes(url)) commitPlayed(p.filter((u) => u !== url));
}

/** Fill mode: maximize the player within the app (hide browse chrome), with a Recent overlay to switch. */
export const fillMode = signal<boolean>(false);

export function setFillMode(v: boolean): void {
  fillMode.set(v);
}

/** The playlist source currently loaded (URL/path), and its region filter — for Refresh + caching. */
export const loadedSource = signal<string | null>(null);
export const loadedRegion = signal<string[] | null>(null);

export function setLoaded(source: string | null, region: string[] | null): void {
  loadedSource.set(source);
  loadedRegion.set(region);
}

/** Current UI language (i18n locale code, e.g. "en", "zh-Hans"). Persisted. */
export const locale = signal<string>("en");

export function setLocale(code: string): void {
  locale.set(code);
}

/**
 * Whether to show country flags. Default off — flags for contested regions are
 * politically loaded, so geography is shown as a neutral country code unless the
 * viewer opts in. (Geography is secondary to language by design.)
 */
export const showFlags = signal<boolean>(false);

export function setShowFlags(on: boolean): void {
  showFlags.set(on);
}

/** Favorite browse-by-language keys, pinned to the top of the language bar. Persisted. */
export const favoriteLanguages = signal<string[]>([]);

export function setFavoriteLanguages(keys: string[]): void {
  favoriteLanguages.set(keys);
}

/** Free-text channel search. When non-empty, the list finds by name across all loaded channels, ignoring browse filters. */
export const channelQuery = signal<string>("");

export function setChannelQuery(q: string): void {
  channelQuery.set(q);
}

/** Channels the viewer has hidden (by URL) — curated out of the list + hotbar, persisted. */
export const hiddenUrls = signal<string[]>([]);

/** Hydrate hidden channels from storage without re-persisting (startup). */
export function setHiddenUrls(urls: string[]): void {
  hiddenUrls.set(urls);
}

/** Hide a channel by URL (idempotent), persisting the choice. */
export function hideChannel(url: string): void {
  if (hiddenUrls.get().includes(url)) return;
  const next = [...hiddenUrls.get(), url];
  hiddenUrls.set(next);
  saveHiddenUrls(next);
  stateSink?.("hidden", next);
}

/**
 * Whether iCloud sync is on for THIS device (default true). Per-device and not
 * itself synced — turning it off on one device must not propagate. Drives the
 * Settings toggle; the actual sync gate reads the persisted value directly.
 */
export const syncEnabled = signal<boolean>(true);

export function setSyncEnabled(on: boolean): void {
  syncEnabled.set(on);
}

/** When true, the list hides channels not confirmed playable (the probe is optimistic). */
export const playableOnly = signal<boolean>(false);

export function setPlayableOnly(v: boolean): void {
  playableOnly.set(v);
}

/**
 * Set a channel's availability by URL when actual playback gives a verdict the
 * reachability probe can't: "live" once it really plays, "dead" once it really
 * fails. Reality beats the optimistic probe. No-op if no channel matches (e.g.
 * the demo stream) or the verdict is unchanged.
 */
function setAvailabilityByUrl(url: string, availability: Channel["availability"]): void {
  const list = channels.get();
  if (!list.some((c) => c.url === url && c.availability !== availability)) return;
  channels.set(list.map((c) => (c.url === url ? { ...c, availability } : c)));
}

/** A stream actually failed to play — mark it dead and drop it from the hotbar. */
export function markUnplayable(url: string): void {
  setAvailabilityByUrl(url, "dead");
  removeFromPlayed(url);
}

/**
 * A stream is ready to play (can-play) — confirm it live, but do NOT add it to
 * the Recent hotbar; that waits for actual playback. No-op for a non-channel URL.
 */
export function confirmLive(url: string): void {
  if (!channels.get().some((c) => c.url === url)) return;
  setAvailabilityByUrl(url, "live");
}

/**
 * A stream actually started PLAYING in the window — confirm it live and add it
 * to the Recent hotbar. Only real playback (not a click, not merely ready)
 * earns a hotbar slot. No-op for a URL that isn't a loaded channel.
 */
export function markPlayable(url: string): void {
  if (!channels.get().some((c) => c.url === url)) return;
  commitPlayed(pushRecent(playedUrls.get(), url, PLAYED_CAP));
  setAvailabilityByUrl(url, "live");
}

/** Languages the viewer is browsing (empty = all). Persisted on-device. */
export const selectedLanguages = signal<string[]>([]);

export function setSelectedLanguages(languages: string[]): void {
  selectedLanguages.set(languages);
}

/** Optional secondary country filter within the selected language(s). */
export const countryFilter = signal<string | null>(null);

export function setCountryFilter(country: string | null): void {
  countryFilter.set(country);
}

/** Genre/categories the viewer is browsing (empty = all). Persisted on-device. */
export const selectedCategories = signal<string[]>([]);

export function setSelectedCategories(categories: string[]): void {
  selectedCategories.set(categories);
}

/** Human-readable channel-scan status ("" when idle/none). */
export const scanStatus = signal<string>("");

export function setScanStatus(status: string): void {
  scanStatus.set(status);
}

/** Channel-scan progress in [0,1]. 0 = idle/not started, 1 = complete. */
export const scanProgress = signal<number>(0);

export function setScanProgress(p: number): void {
  scanProgress.set(p);
}

/** Set the source that should play. The only entry point for changing playback. */
export function setCurrentSource(src: string | null): void {
  currentSource.set(src);
}

/** Record a playback status transition (driven by player events). */
export function setPlaybackState(state: PlaybackState): void {
  playbackState.set(state);
}

/** Return playback status to its initial value. */
export function resetPlaybackState(): void {
  playbackState.set(INITIAL_PLAYBACK_STATE);
}

// Re-export the Lit integration so components depend on this module rather
// than reaching into @lit-labs/signals — keeps the swap point to one file.
export { SignalWatcher, watch };
