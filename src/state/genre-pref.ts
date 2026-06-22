/**
 * Genre browse (R3) — a third browse facet alongside language and country.
 * Categories come from iptv-org enrichment; scoping mirrors language: only
 * selected categories actually present apply, and a selection whose categories
 * are all absent is ignored rather than emptying the grid (no dead-end).
 *
 * The selection persists on-device in the WebView's localStorage. The pure
 * scoping functions are tested; the localStorage wrappers are verified in-app.
 */
import type { Channel } from "../model/channel";

/** Distinct categories present across the channels, alphabetical. */
export function availableCategories(channels: Channel[]): string[] {
  const set = new Set<string>();
  for (const c of channels) for (const cat of c.categories) set.add(cat);
  return [...set].sort();
}

/**
 * Scope channels to the selected categories (empty = all). A channel passes if
 * any of its categories is selected. Selected categories not present in the
 * list are dropped; if that leaves nothing selected, all channels pass.
 */
export function scopeByCategories(channels: Channel[], selected: string[]): Channel[] {
  const present = new Set(channels.flatMap((c) => c.categories));
  const effective = selected.filter((cat) => present.has(cat));
  if (effective.length === 0) return channels;
  return channels.filter((c) => c.categories.some((cat) => effective.includes(cat)));
}

const STORAGE_KEY = "telstar.selectedCategories";

/** Load the persisted category selection from on-device storage. */
export function loadSelectedCategories(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Persist the category selection on-device. */
export function saveSelectedCategories(categories: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories));
  } catch {
    /* storage unavailable; selection stays in-memory for the session */
  }
}
