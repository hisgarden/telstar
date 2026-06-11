/**
 * Native-HLS freeze recovery.
 *
 * On iOS, IPTV plays through AVFoundation's native HLS pipeline (the only path
 * that survives backgrounding). Unlike hls.js it exposes no
 * `recoverMediaError()` / `startLoad()` hooks, so a live stream that stalls
 * behind a discontinuity or timestamp jump simply freezes with no way to ask it
 * to recover. This is the native-path analogue of the player's hls.js recovery
 * budget: the player samples the `<video>`'s `currentTime` on a timer and, when
 * it stops advancing during playback, escalates
 *
 *     seek-to-live-edge → reload → cull (mark dead)
 *
 * mirroring `MAX_HLS_RECOVERIES` in the player. This module is the pure decision
 * core — synchronous and testable; the player owns the timer and performs the
 * chosen action (only meaningful while playing in the foreground, since JS is
 * suspended in the background).
 */

/** What the player should do this tick. */
export type StallAction = "none" | "seek-live" | "reload" | "cull";

/** `currentTime` must advance by more than this between samples to count as healthy. */
export const ADVANCE_EPSILON = 0.25;

/** Consecutive-stall counts at which each recovery rung kicks in. */
export const SEEK_AT = 1;
export const RELOAD_AT = 2;
export const CULL_AT = 5;

export interface WatchdogState {
  /** `currentTime` at the previous sample. */
  lastTime: number;
  /** Consecutive samples with no forward progress. */
  stalls: number;
}

export interface PlaybackSample {
  currentTime: number;
  paused: boolean;
  ended: boolean;
}

export interface WatchdogStep {
  state: WatchdogState;
  action: StallAction;
}

/**
 * A fresh watchdog, reset on every source change. `lastTime` seeds at -∞ so the
 * first sample always reads as progress (seeding the baseline) — a stream whose
 * `currentTime` starts at 0 is never mistaken for frozen on the opening tick.
 */
export const initialWatchdog = (): WatchdogState => ({
  lastTime: Number.NEGATIVE_INFINITY,
  stalls: 0,
});

/** The recovery rung for a given consecutive-stall count. */
function actionFor(stalls: number): StallAction {
  if (stalls >= CULL_AT) return "cull";
  if (stalls >= RELOAD_AT) return "reload";
  if (stalls >= SEEK_AT) return "seek-live";
  return "none";
}

/**
 * Advance the watchdog by one sample. Returns the next state and the action to
 * take. A paused or ended element is not "stalled" — its counter resets so a
 * deliberate pause never triggers recovery.
 */
export function step(state: WatchdogState, sample: PlaybackSample): WatchdogStep {
  if (sample.paused || sample.ended) {
    return { state: { lastTime: sample.currentTime, stalls: 0 }, action: "none" };
  }
  const advanced = sample.currentTime > state.lastTime + ADVANCE_EPSILON;
  if (advanced) {
    return { state: { lastTime: sample.currentTime, stalls: 0 }, action: "none" };
  }
  const stalls = state.stalls + 1;
  return { state: { lastTime: sample.currentTime, stalls }, action: actionFor(stalls) };
}
