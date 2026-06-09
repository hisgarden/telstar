/**
 * Availability merge, working-first ordering, and staleness (R2, R3).
 *
 * The channel-scan returns a verdict per URL; these helpers fold it into the
 * channel model, order the grid so what plays comes first, and decide when a
 * persisted working set is stale enough to re-scan (the "auto-tune" refresh).
 */
import type { Channel, PlaybackAvailability } from "../model/channel";
import type { ScanResult } from "../scan";

/** Lower rank sorts first: live › slow › unknown › dead (working-first). */
const RANK: Record<PlaybackAvailability, number> = {
  live: 0,
  slow: 1,
  unknown: 2,
  dead: 3,
};

/** Merge scan verdicts into channels by URL. Unmatched results are ignored. */
export function applyScanResults(channels: Channel[], results: ScanResult[]): Channel[] {
  const byUrl = new Map(results.map((r) => [r.url, r.availability]));
  return channels.map((c) => {
    const a = byUrl.get(c.url);
    return a ? { ...c, availability: a } : c;
  });
}

/** Return a working-first-ordered copy; stable within equal availability. */
export function sortWorkingFirst(channels: Channel[]): Channel[] {
  return channels
    .map((c, i) => [c, i] as const)
    .sort(([a, ai], [b, bi]) => RANK[a.availability] - RANK[b.availability] || ai - bi)
    .map(([c]) => c);
}

// NOTE: a displayableChannels() helper that hid channels not confirmed playable
// used to live here. Deliberately removed (2026-06-06): the probe's verdict is
// not reliable enough to gate what the viewer can see or select — availability
// only orders the list (working-first) and colors the status dot. Do not
// reintroduce playable-gated filtering of the channel list.

/** True if a persisted working set should be re-scanned (missing or past TTL). */
export function isStale(scannedAt: number | null, now: number, ttlMs: number): boolean {
  if (scannedAt == null) return true;
  return now - scannedAt > ttlMs;
}
