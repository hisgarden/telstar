/**
 * Channel-scan wrapper — invokes the native reachability probe. The scan runs
 * from the user's own machine, so a "live" result means "available to you,
 * here" (R1). Reachability is not a playback guarantee.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriAvailable, TauriUnavailableError } from "./ingest";
import type { PlaybackAvailability } from "./model/channel";

export interface ScanResult {
  url: string;
  availability: PlaybackAvailability;
}

/**
 * Probe a batch of channel URLs for reachability. Resolves to one result per
 * URL (live/slow/dead). Rejects with TauriUnavailableError in the browser
 * preview (no native runtime).
 */
export function scanChannels(urls: string[]): Promise<ScanResult[]> {
  if (!isTauriAvailable()) {
    return Promise.reject(new TauriUnavailableError("Channel scan needs the Telstar desktop app."));
  }
  return invoke<ScanResult[]>("scan_channels", { urls });
}
