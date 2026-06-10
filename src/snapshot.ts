/**
 * Snapshot capture (R6, AE7) — the "living" part of the contact sheet.
 *
 * `cellVisual` is the pure render decision: show a cached snapshot when present,
 * otherwise the channel logo + country icon (never a bare cell). That decision
 * is fully tested headless and guarantees the grid ships regardless of capture.
 *
 * `captureFromVideo` grabs one frame from a cell's *already-playing* hls.js
 * preview (<video> → <canvas>) and caches it via the native core — so hovering
 * a channel makes its cell come alive next time, with no extra decode. Because
 * hls.js feeds frames through MSE (a local blob source), the canvas is usually
 * not CORS-tainted; on any failure (incl. a tainted canvas) it resolves null
 * and the cell keeps its logo fallback. Needs native verification.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauriAvailable } from "./ingest";
import type { Channel } from "./model/channel";

export type CellVisual =
  | { kind: "snapshot"; src: string }
  | { kind: "fallback"; logo: string | null; country: string | null };

/** Decide what a grid cell renders: cached snapshot, else logo + country. */
export function cellVisual(channel: Channel, snapshot: string | null): CellVisual {
  if (snapshot) return { kind: "snapshot", src: snapshot };
  return { kind: "fallback", logo: channel.logo, country: channel.country };
}

/** Load a cached snapshot data-URL for a channel URL, or null if none. */
export async function loadSnapshot(url: string): Promise<string | null> {
  if (!isTauriAvailable()) return null;
  try {
    return await invoke<string | null>("load_snapshot", { url });
  } catch {
    return null;
  }
}

/**
 * Capture the current frame from an already-playing preview <video> and cache
 * it via the native core. Resolves the data-URL on success, or null on any
 * failure (no frame yet, tainted canvas, browser preview). Never throws.
 */
export async function captureFromVideo(
  url: string,
  video: HTMLVideoElement,
): Promise<string | null> {
  if (!isTauriAvailable() || !video.videoWidth || !video.videoHeight) return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6); // may throw if tainted
    try {
      await invoke("save_snapshot", { url, dataUrl });
    } catch {
      /* cache write best-effort; still return the frame for this session */
    }
    return dataUrl;
  } catch {
    return null; // tainted canvas / cross-origin → keep the logo fallback
  }
}
