/**
 * Language-first browse (R10) — scope the grid to the viewer's language(s),
 * aggregated across countries, with an optional secondary country filter.
 * Language is the spine; geography is secondary.
 *
 * The selected languages persist on-device in the WebView's localStorage (a
 * small UI preference, kept off the per-playlist store). The pure scoping
 * functions below are tested; the localStorage wrappers are verified in-app.
 */
import { UNKNOWN_LANGUAGE } from "./channels";
import type { Channel } from "../model/channel";

const effectiveLanguage = (c: Channel): string => c.language ?? UNKNOWN_LANGUAGE;

/** Distinct languages present, alphabetical with "Unknown language" last. */
export function availableLanguages(channels: Channel[]): string[] {
  const set = new Set(channels.map(effectiveLanguage));
  const known = [...set].filter((l) => l !== UNKNOWN_LANGUAGE).sort();
  return set.has(UNKNOWN_LANGUAGE) ? [...known, UNKNOWN_LANGUAGE] : known;
}

/** Distinct non-null countries among channels within the selected languages. */
export function availableCountries(channels: Channel[], selected: string[]): string[] {
  const inScope = selected.length === 0 ? channels : channels.filter((c) => selected.includes(effectiveLanguage(c)));
  return [...new Set(inScope.map((c) => c.country).filter((c): c is string => c != null))].sort();
}

/**
 * Scope channels to the selected languages (empty = all), then to a country
 * (null = all). Languages aggregate across countries; country narrows within.
 *
 * Only selected languages actually present in the list apply. A selection whose
 * languages are all absent (e.g. a stale persisted "Unknown language" after the
 * list became "Chinese") is ignored rather than filtering everything to empty —
 * no dead-end.
 */
export function scopeChannels(
  channels: Channel[],
  selected: string[],
  country: string | null,
): Channel[] {
  const present = new Set(channels.map(effectiveLanguage));
  const effective = selected.filter((l) => present.has(l));
  let out = channels;
  if (effective.length > 0) out = out.filter((c) => effective.includes(effectiveLanguage(c)));
  if (country != null) out = out.filter((c) => c.country === country);
  return out;
}

const STORAGE_KEY = "telstar.selectedLanguages";

/** Load the persisted language selection from on-device storage. */
export function loadSelectedLanguages(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Persist the language selection on-device. */
export function saveSelectedLanguages(languages: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(languages));
  } catch {
    /* storage unavailable; selection stays in-memory for the session */
  }
}
