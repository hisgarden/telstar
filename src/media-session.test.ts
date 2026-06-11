import { describe, it, expect } from "bun:test";
import {
  artworkFor,
  bindTransport,
  setCardPlaybackState,
  setNowPlaying,
  type MediaSessionLike,
  type TransportAction,
} from "./media-session";

/** A fake `navigator.mediaSession` that records what the player wrote. */
function fakeSession() {
  const handlers = new Map<TransportAction, (() => void) | null>();
  const session: MediaSessionLike = {
    metadata: null,
    playbackState: "none",
    setActionHandler(action, handler) {
      handlers.set(action, handler);
    },
  };
  return { session, handlers };
}

/** A fake `MediaMetadata` ctor that just keeps the init it was given. */
class FakeMetadata {
  constructor(public init: { title: string; artist: string; artwork: { src: string }[] }) {}
}

describe("artworkFor", () => {
  it("Given a logo, When building artwork, Then it carries the logo as a single source", () => {
    expect(artworkFor("https://e/logo.png")).toEqual([{ src: "https://e/logo.png" }]);
  });
  it("Given no logo, When building artwork, Then it is empty (never a broken image)", () => {
    expect(artworkFor(null)).toEqual([]);
  });
});

describe("setNowPlaying", () => {
  it("Given a session and a channel, When published, Then the card metadata reflects name + logo", () => {
    const { session } = fakeSession();
    setNowPlaying(session, FakeMetadata, {
      title: "BBC One",
      artist: "United Kingdom",
      logo: "https://e/bbc.png",
    });
    expect((session.metadata as FakeMetadata).init).toEqual({
      title: "BBC One",
      artist: "United Kingdom",
      artwork: [{ src: "https://e/bbc.png" }],
    });
  });

  it("Given no Media Session (older iOS), When publishing, Then it is a safe no-op", () => {
    // Neither call should throw.
    expect(() => setNowPlaying(null, FakeMetadata, { title: "x", artist: "y", logo: null })).not.toThrow();
    const { session } = fakeSession();
    setNowPlaying(session, null, { title: "x", artist: "y", logo: null });
    expect(session.metadata).toBeNull();
  });
});

describe("bindTransport", () => {
  it("Given transport handlers, When bound, Then ⏭/⏮ map to channel next/prev and play/pause are wired", () => {
    const { session, handlers } = fakeSession();
    const calls: string[] = [];
    bindTransport(session, {
      play: () => calls.push("play"),
      pause: () => calls.push("pause"),
      next: () => calls.push("next"),
      prev: () => calls.push("prev"),
    });
    handlers.get("nexttrack")?.();
    handlers.get("previoustrack")?.();
    handlers.get("play")?.();
    handlers.get("pause")?.();
    expect(calls).toEqual(["next", "prev", "play", "pause"]);
  });

  it("Given no session, When binding, Then it is a safe no-op", () => {
    expect(() =>
      bindTransport(null, { play() {}, pause() {}, next() {}, prev() {} }),
    ).not.toThrow();
  });
});

describe("setCardPlaybackState", () => {
  it("Given a session, When playback state changes, Then the card mirrors it", () => {
    const { session } = fakeSession();
    setCardPlaybackState(session, "playing");
    expect(session.playbackState).toBe("playing");
    setCardPlaybackState(session, "paused");
    expect(session.playbackState).toBe("paused");
  });

  it("Given no session, When setting playback state, Then it is a safe no-op", () => {
    expect(() => setCardPlaybackState(null, "playing")).not.toThrow();
  });
});
