/**
 * Availability verdicts for iCloud sync. The expensive computed bit of a scan
 * is "what plays from my network" — a per-URL availability verdict. Syncing the
 * compact verdict map (instead of full channel objects) keeps iCloud payloads
 * tiny: the channel list itself is re-fetched from its source on each device,
 * then the synced verdicts are merged back in by URL.
 *
 * Pure — no I/O, no signals.
 */
import type { Channel, PlaybackAvailability } from "./channel";

/** url → availability, for channels whose availability is known (live/slow/dead). */
export type VerdictMap = Record<string, PlaybackAvailability>;

/** Compact a channel set to its known verdicts. "unknown" is omitted (nothing to sync). */
export function toVerdictMap(channels: Channel[]): VerdictMap {
  const map: VerdictMap = {};
  for (const c of channels) {
    if (c.availability !== "unknown") map[c.url] = c.availability;
  }
  return map;
}

/**
 * Merge synced verdicts into channels by URL: a channel still "unknown" locally
 * adopts the synced verdict; a channel already scanned locally keeps its own
 * (local probe reflects this device's network, which is authoritative here).
 */
export function mergeVerdicts(channels: Channel[], verdicts: VerdictMap): Channel[] {
  return channels.map((c) => {
    if (c.availability !== "unknown") return c;
    const v = verdicts[c.url];
    return v ? { ...c, availability: v } : c;
  });
}

/** Single-char codes keep the synced payload small (well under the KVS limit). */
const TO_CODE: Record<string, string> = { live: "l", slow: "s", dead: "d" };
const FROM_CODE: Record<string, PlaybackAvailability> = { l: "live", s: "slow", d: "dead" };

/** A source's verdicts ready for iCloud: when it was scanned + compact codes. */
export interface SyncedVerdicts {
  scannedAt: number;
  map: Record<string, string>;
}

/** Compact a verdict map to coded form, tagged with the scan time. */
export function encodeVerdicts(verdicts: VerdictMap, scannedAt: number): SyncedVerdicts {
  const map: Record<string, string> = {};
  for (const [url, availability] of Object.entries(verdicts)) {
    const code = TO_CODE[availability];
    if (code) map[url] = code;
  }
  return { scannedAt, map };
}

/** Expand coded verdicts back to a verdict map; unknown codes are dropped. */
export function decodeVerdicts(synced: SyncedVerdicts | null | undefined): VerdictMap {
  const out: VerdictMap = {};
  if (!synced || typeof synced !== "object" || typeof synced.map !== "object" || !synced.map) {
    return out;
  }
  for (const [url, code] of Object.entries(synced.map)) {
    const availability = FROM_CODE[code];
    if (availability) out[url] = availability;
  }
  return out;
}
