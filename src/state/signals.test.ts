import { describe, it, expect, beforeEach } from "bun:test";
import { computed } from "@lit-labs/signals";
import {
  currentSource,
  playbackState,
  setCurrentSource,
  setPlaybackState,
  resetPlaybackState,
  INITIAL_PLAYBACK_STATE,
} from "./signals";

// The signals store is the agent-native seam: the player and any future
// channel browser drive playback solely by writing these signals. These
// behavioral specs pin that contract — observable state, not internals.

const DEMO = "https://stream.example.com/demo.m3u8";

describe("signals store", () => {
  beforeEach(() => {
    setCurrentSource(null);
    resetPlaybackState();
  });

  it("Given a new source, When setCurrentSource is called, Then currentSource reads back the new value", () => {
    setCurrentSource(DEMO);
    expect(currentSource.get()).toBe(DEMO);
  });

  it("Given a watcher derived from currentSource, When the source changes, Then the watcher observes the update", () => {
    const watched = computed(() => currentSource.get());
    expect(watched.get()).toBeNull();

    setCurrentSource(DEMO);
    expect(watched.get()).toBe(DEMO);
  });

  it("Given two independent readers of currentSource, When it updates, Then both observe the same value", () => {
    const a = computed(() => currentSource.get());
    const b = computed(() => currentSource.get());
    setCurrentSource(DEMO);
    expect(a.get()).toBe(DEMO);
    expect(b.get()).toBe(a.get());
  });

  it("Given playbackState moved to 'playing', When resetPlaybackState is called, Then it returns to the initial state and watchers see it", () => {
    const watched = computed(() => playbackState.get());
    setPlaybackState("playing");
    expect(watched.get()).toBe("playing");

    resetPlaybackState();
    expect(playbackState.get()).toBe(INITIAL_PLAYBACK_STATE);
    expect(watched.get()).toBe(INITIAL_PLAYBACK_STATE);
  });

  it("Given a sequence of playback transitions, When applied, Then the latest state is observable", () => {
    const seen: string[] = [];
    const watched = computed(() => playbackState.get());
    for (const s of ["can-play", "playing", "paused"] as const) {
      setPlaybackState(s);
      seen.push(watched.get());
    }
    expect(seen).toEqual(["can-play", "playing", "paused"]);
    expect(playbackState.get()).toBe("paused");
  });
});
