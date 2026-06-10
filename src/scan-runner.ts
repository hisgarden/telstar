/**
 * Scan orchestration — the "channel-scan / auto-tune" runner shared by load
 * (initial scan) and startup (re-scan when the working set is stale).
 *
 * Listens for per-batch `scan-progress` events from the native probe, applies
 * each batch into the channels signal (reordering working-first as it goes),
 * and drives a progress signal — so the grid visibly re-tunes while scanning.
 * Native-only: no-ops in the browser preview.
 */
import { listen } from "@tauri-apps/api/event";
import { scanChannels, type ScanResult } from "./scan";
import { isTauriAvailable } from "./ingest";
import { applyScanResults, sortWorkingFirst } from "./state/availability";
import { setChannels, setScanStatus, setScanProgress, loadedSource } from "./state/signals";
import { saveCachedScan, cacheKey } from "./persistence";
import { toVerdictMap, encodeVerdicts } from "./model/verdicts";
import { pushVerdicts } from "./sync";
import type { Channel } from "./model/channel";

/** How stale before we refresh on startup (6 hours). */
export const SCAN_TTL_MS = 6 * 60 * 60 * 1000;

interface ScanProgressEvent {
  done: number;
  total: number;
  results: ScanResult[];
}

/**
 * Probe the channels, applying results batch-by-batch (working-first reorder +
 * progress) and persisting the final working set. No-op in the browser preview.
 */
export async function runScan(
  channels: Channel[],
  source: string | null,
  idCountries: string[] | null = null,
): Promise<void> {
  if (channels.length === 0 || !isTauriAvailable()) return;

  // Operate on a LOCAL copy of the channels being scanned — never the live
  // signal — so switching language mid-scan can't corrupt this source's cache,
  // and a stale scan can't overwrite the new list. Only touch the visible
  // signal/status while this source is still the loaded one.
  let working = channels;
  const isCurrent = () => source == null || loadedSource.get() === source;

  if (isCurrent()) {
    setScanStatus(`Scanning ${channels.length} channels…`);
    setScanProgress(0.001); // > 0 so the bar appears immediately
  }

  const unlisten = await listen<ScanProgressEvent>("scan-progress", (event) => {
    const { done, total, results } = event.payload;
    working = sortWorkingFirst(applyScanResults(working, results));
    if (isCurrent()) {
      setChannels(working);
      setScanStatus(`Scanning ${done}/${total}…`);
      setScanProgress(total > 0 ? done / total : 1);
    }
  });

  try {
    await scanChannels(channels.map((c) => c.url));
    const playable = working.filter(
      (c) => c.availability === "live" || c.availability === "slow",
    ).length;
    if (isCurrent()) {
      setChannels(working);
      setScanStatus(`${playable} of ${working.length} channels available`);
      setScanProgress(1);
    }
    if (source) {
      // Save the correct scanned set for THIS source (not the live signal).
      const key = cacheKey(source, idCountries);
      const scannedAt = Date.now();
      await saveCachedScan(key, { source, idCountries, channels: working, scannedAt });
      // Mirror the compact verdicts to iCloud so other devices get a working-
      // first hint before they re-scan (gated; the local probe stays authoritative).
      void pushVerdicts(key, encodeVerdicts(toVerdictMap(working), scannedAt));
    }
  } catch (err) {
    if (isCurrent()) {
      setScanStatus("");
      setScanProgress(0);
    }
    throw err;
  } finally {
    unlisten();
  }
}
