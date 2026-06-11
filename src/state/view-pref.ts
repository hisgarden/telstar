/**
 * View preferences persisted on-device (WebView localStorage). Small UI toggles
 * kept off the per-playlist store, mirroring language/genre prefs.
 */
const PLAYABLE_ONLY_KEY = "telstar.playableOnly";

/** Load the persisted "playable only" toggle (default false). */
export function loadPlayableOnly(): boolean {
  try {
    return localStorage.getItem(PLAYABLE_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the "playable only" toggle. */
export function savePlayableOnly(v: boolean): void {
  try {
    localStorage.setItem(PLAYABLE_ONLY_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable; stays in-memory for the session */
  }
}

function loadStringArray(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveStringArray(key: string, urls: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(urls));
  } catch {
    /* storage unavailable; stays in-memory for the session */
  }
}

const SHOW_FLAGS_KEY = "telstar.showFlags";

/** Load the "show country flags" preference — default OFF (neutral: show the code). */
export function loadShowFlags(): boolean {
  try {
    return localStorage.getItem(SHOW_FLAGS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the "show country flags" preference. */
export function saveShowFlags(on: boolean): void {
  try {
    localStorage.setItem(SHOW_FLAGS_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable; stays in-memory for the session */
  }
}

const LOCALE_KEY = "telstar.locale";

/** Load the UI locale: saved choice, else detect from the system, else English. */
export function loadLocale(): string {
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    if (saved) return saved;
    const nav = (navigator?.language ?? "en").toLowerCase();
    if (nav.startsWith("zh")) {
      return /hant|tw|hk|mo/.test(nav) ? "zh-Hant" : "zh-Hans";
    }
    return "en";
  } catch {
    return "en";
  }
}

/** Persist the UI locale. */
export function saveLocale(code: string): void {
  try {
    localStorage.setItem(LOCALE_KEY, code);
  } catch {
    /* storage unavailable; stays in-memory for the session */
  }
}

// v4: removed the curated USA/UK sources; a fresh key clears them from favorites.
const FAVORITE_LANGUAGES_KEY = "telstar.favoriteLanguages.v4";

/** Default favorite browse keys — English (all regions), Chinese, Cantonese. */
export const DEFAULT_FAVORITE_LANGUAGES = [
  "eng-us",
  "eng-uk",
  "eng-apac",
  "chinese",
  "spa",
  "fra",
  "ita",
  "deu",
  "ara",
];

/** Load favorite browse keys; defaults when never set (an explicit [] is kept). */
export function loadFavoriteLanguages(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITE_LANGUAGES_KEY);
    if (raw == null) return [...DEFAULT_FAVORITE_LANGUAGES];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [...DEFAULT_FAVORITE_LANGUAGES];
  } catch {
    return [...DEFAULT_FAVORITE_LANGUAGES];
  }
}

/** Persist favorite browse keys. */
export function saveFavoriteLanguages(keys: string[]): void {
  saveStringArray(FAVORITE_LANGUAGES_KEY, keys);
}

const CAPTIONS_ON_KEY = "telstar.captionsOn";

/** Load the captions preference — default ON (show captions when available). */
export function loadCaptionsOn(): boolean {
  try {
    return localStorage.getItem(CAPTIONS_ON_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Persist the captions on/off preference. */
export function saveCaptionsOn(on: boolean): void {
  try {
    localStorage.setItem(CAPTIONS_ON_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable; stays in-memory for the session */
  }
}

const SYNC_ENABLED_KEY = "telstar.syncEnabled";

/**
 * Load the "sync with iCloud" preference — default ON. This pref is per-device
 * and intentionally NOT itself synced: turning sync off on one device must not
 * propagate to the others.
 */
export function loadSyncEnabled(): boolean {
  try {
    return localStorage.getItem(SYNC_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

/** Persist the "sync with iCloud" preference. */
export function saveSyncEnabled(on: boolean): void {
  try {
    localStorage.setItem(SYNC_ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable; stays in-memory for the session */
  }
}

const PLAYED_URLS_KEY = "telstar.playedUrls";

/** Load the persisted played-channels hotbar (most-recent first). */
export function loadPlayedUrls(): string[] {
  return loadStringArray(PLAYED_URLS_KEY);
}

/** Persist the played-channels hotbar. */
export function savePlayedUrls(urls: string[]): void {
  saveStringArray(PLAYED_URLS_KEY, urls);
}

const HIDDEN_URLS_KEY = "telstar.hiddenUrls";

/** Load the persisted set of hidden channel URLs. */
export function loadHiddenUrls(): string[] {
  return loadStringArray(HIDDEN_URLS_KEY);
}

/** Persist the set of hidden channel URLs. */
export function saveHiddenUrls(urls: string[]): void {
  saveStringArray(HIDDEN_URLS_KEY, urls);
}
