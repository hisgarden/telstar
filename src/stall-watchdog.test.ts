import { describe, it, expect } from "bun:test";
import {
  initialWatchdog,
  step,
  type PlaybackSample,
  type StallAction,
} from "./stall-watchdog";

/** Drive a sequence of samples through the watchdog, collecting the actions. */
function run(samples: PlaybackSample[]): StallAction[] {
  let state = initialWatchdog();
  const actions: StallAction[] = [];
  for (const s of samples) {
    const out = step(state, s);
    state = out.state;
    actions.push(out.action);
  }
  return actions;
}

const playingAt = (t: number): PlaybackSample => ({ currentTime: t, paused: false, ended: false });

describe("stall watchdog", () => {
  it("Given time advancing each sample, When stepped, Then it never acts", () => {
    expect(run([playingAt(0), playingAt(2), playingAt(4), playingAt(6)])).toEqual([
      "none",
      "none",
      "none",
      "none",
    ]);
  });

  it("Given a first frozen sample, When stepped, Then it seeks to the live edge", () => {
    // 0 → 2 (healthy), then frozen at 2.
    expect(run([playingAt(0), playingAt(2), playingAt(2)])).toEqual(["none", "none", "seek-live"]);
  });

  it("Given a sustained freeze, When it persists, Then it escalates seek → reload → cull", () => {
    const frozen = [playingAt(5), playingAt(5), playingAt(5), playingAt(5), playingAt(5), playingAt(5)];
    // first sample seeds lastTime (none), then 5 consecutive stalls.
    expect(run(frozen)).toEqual(["none", "seek-live", "reload", "reload", "reload", "cull"]);
  });

  it("Given a freeze that resolves, When time advances again, Then the budget resets", () => {
    expect(run([playingAt(0), playingAt(0), playingAt(3), playingAt(3)])).toEqual([
      "none",
      "seek-live",
      "none",
      "seek-live",
    ]);
  });

  it("Given a paused element, When stepped, Then it is never treated as stalled", () => {
    const paused: PlaybackSample = { currentTime: 9, paused: true, ended: false };
    expect(run([playingAt(9), paused, paused])).toEqual(["none", "none", "none"]);
  });

  it("Given an ended element, When stepped, Then it is never treated as stalled", () => {
    const ended: PlaybackSample = { currentTime: 30, paused: false, ended: true };
    expect(run([playingAt(30), ended, ended])).toEqual(["none", "none", "none"]);
  });

  it("Given sub-epsilon drift, When stepped, Then it counts as a stall (not real progress)", () => {
    // +0.1s between samples is below ADVANCE_EPSILON — a stuck-but-jittering stream.
    expect(run([playingAt(0), { currentTime: 0.1, paused: false, ended: false }])).toEqual([
      "none",
      "seek-live",
    ]);
  });
});
