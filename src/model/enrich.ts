/**
 * Channel enrichment (R2/R3): join loaded channels against the cached iptv-org
 * database to add genre categories and fill a missing language. Pure and
 * headless-testable — the index is built from raw records (channels.json +
 * feeds.json) and applied without any I/O.
 *
 * Join key is the channel's tvg-id base — the part before any `@feed` suffix
 * (e.g. `AndoTV.cn@SD` → `AndoTV.cn`). Enrichment is additive and defensive:
 * malformed records contribute nothing rather than throwing, language is FILLED
 * only when absent (an explicit tvg-language is never overwritten), and an
 * unmatched or null id passes the channel through unchanged.
 */
import type { Channel } from "./channel";
import { languageName } from "./language";

/** Per-id enrichment: genre categories + language codes (iso-639-3). */
export interface EnrichmentEntry {
  categories: string[];
  languages: string[];
}

export type EnrichmentIndex = Map<string, EnrichmentEntry>;

/** Strip an `@feed` suffix to get the base channel id. */
export function baseId(id: string): string {
  const at = id.indexOf("@");
  return at >= 0 ? id.slice(0, at) : id;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function entryFor(index: EnrichmentIndex, id: string): EnrichmentEntry {
  let entry = index.get(id);
  if (!entry) {
    entry = { categories: [], languages: [] };
    index.set(id, entry);
  }
  return entry;
}

/**
 * Build a lookup keyed by base channel id from raw iptv-org records.
 * `channelRecords` supply `id` + `categories`; `feedRecords` supply `channel`
 * (the base id) + `languages`. Records missing those fields are skipped.
 */
export function buildEnrichmentIndex(
  channelRecords: unknown[],
  feedRecords: unknown[],
): EnrichmentIndex {
  const index: EnrichmentIndex = new Map();

  for (const raw of channelRecords) {
    const rec = asRecord(raw);
    const id = rec && typeof rec.id === "string" ? rec.id : null;
    if (!id) continue;
    entryFor(index, baseId(id)).categories = asStringArray(rec!.categories);
  }

  for (const raw of feedRecords) {
    const rec = asRecord(raw);
    const channel = rec && typeof rec.channel === "string" ? rec.channel : null;
    if (!channel) continue;
    const languages = asStringArray(rec!.languages);
    if (languages.length) entryFor(index, baseId(channel)).languages.push(...languages);
  }

  return index;
}

/**
 * Return new channels enriched against the index. Both fields are FILLED, never
 * overwritten: categories are taken from the matched record only when the
 * channel has none (so a curated pack's hand-set tags survive enrichment), and
 * a missing language is filled from the first feed language code (mapped to a
 * display name). Explicit categories/languages, unmatched ids, and null ids are
 * left untouched.
 */
export function enrichChannels(channels: Channel[], index: EnrichmentIndex): Channel[] {
  return channels.map((c) => {
    if (c.id == null) return c;
    const entry = index.get(baseId(c.id));
    if (!entry) return c;
    const categories = c.categories.length > 0 ? c.categories : entry.categories;
    const language = c.language ?? (entry.languages[0] ? languageName(entry.languages[0]) : null);
    return { ...c, categories, language };
  });
}
