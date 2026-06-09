/**
 * Enrichment orchestration — the load/hydrate counterpart to scan-runner.
 *
 * Ensures the iptv-org metadata cache is fresh, looks up only the records for
 * the loaded channels (pruned native-side), builds the enrichment index, and
 * applies it to the channels signal: genre categories + a filled-in language.
 * Native-only and best-effort — returns the channels unchanged in the browser
 * preview or when no metadata matches, so it never blocks or breaks the load.
 */
import { isTauriAvailable } from "./ingest";
import { ensureMetadata, lookupMetadata } from "./metadata";
import { baseId, buildEnrichmentIndex, enrichChannels } from "./model/enrich";
import { setChannels, loadedSource } from "./state/signals";
import type { Channel } from "./model/channel";

/** Unique base channel ids (tvg-id before any @feed suffix); null ids omitted. */
export function enrichmentIds(channels: Channel[]): string[] {
  const ids = new Set<string>();
  for (const c of channels) {
    if (c.id != null) ids.add(baseId(c.id));
  }
  return [...ids];
}

/**
 * Enrich the GIVEN channels against the cached iptv-org database. Returns the
 * enriched list (or the input unchanged when unavailable). Updates the visible
 * list only if `source` is still the loaded one — so switching languages
 * mid-enrich never overwrites the new list. Never throws.
 */
export async function runEnrich(
  channels: Channel[],
  source: string | null = null,
): Promise<Channel[]> {
  if (channels.length === 0 || !isTauriAvailable()) return channels;
  try {
    if (!(await ensureMetadata())) return channels;
    const { channels: channelRecords, feeds } = await lookupMetadata(enrichmentIds(channels));
    if (channelRecords.length === 0 && feeds.length === 0) return channels;
    const index = buildEnrichmentIndex(channelRecords, feeds);
    const enriched = enrichChannels(channels, index);
    if (source == null || loadedSource.get() === source) setChannels(enriched);
    return enriched;
  } catch {
    return channels;
  }
}
