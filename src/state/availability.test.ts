import { describe, it, expect } from "bun:test";
import { applyScanResults, sortWorkingFirst, isStale } from "./availability";
import type { Channel } from "../model/channel";
import type { PlaybackAvailability } from "../model/channel";

function ch(availability: PlaybackAvailability, url: string): Channel {
  return {
    id: null,
    name: url,
    logo: null,
    country: null,
    language: null,
    group: null,
    number: null,
    url,
    availability,
    categories: [],
  };
}

describe("applyScanResults", () => {
  it("Given scan results, When applied, Then each channel's availability is set by URL", () => {
    const out = applyScanResults(
      [ch("unknown", "https://e/a"), ch("unknown", "https://e/b")],
      [
        { url: "https://e/a", availability: "dead" },
        { url: "https://e/b", availability: "live" },
      ],
    );
    expect(out.find((c) => c.url === "https://e/a")!.availability).toBe("dead");
    expect(out.find((c) => c.url === "https://e/b")!.availability).toBe("live");
  });

  it("Given a result URL not in channels, When applied, Then it is ignored without error", () => {
    const out = applyScanResults([ch("unknown", "https://e/a")], [
      { url: "https://e/zzz", availability: "live" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].availability).toBe("unknown");
  });
});

describe("sortWorkingFirst", () => {
  it("Covers AE1. Given mixed availability, When sorted, Then order is live, slow, unknown, dead", () => {
    const sorted = sortWorkingFirst([
      ch("dead", "https://e/d"),
      ch("live", "https://e/l"),
      ch("unknown", "https://e/u"),
      ch("slow", "https://e/s"),
    ]);
    expect(sorted.map((c) => c.availability)).toEqual(["live", "slow", "unknown", "dead"]);
  });

  it("Given equal availability, When sorted, Then original order is preserved (stable)", () => {
    const sorted = sortWorkingFirst([ch("live", "https://e/1"), ch("live", "https://e/2")]);
    expect(sorted.map((c) => c.url)).toEqual(["https://e/1", "https://e/2"]);
  });
});

describe("isStale", () => {
  const TTL = 60_000;
  it("Given no scan timestamp, When checked, Then it is stale", () => {
    expect(isStale(null, 1_000_000, TTL)).toBe(true);
  });
  it("Given a timestamp older than the TTL, When checked, Then it is stale", () => {
    expect(isStale(1_000_000 - TTL - 1, 1_000_000, TTL)).toBe(true);
  });
  it("Given a recent timestamp, When checked, Then it is not stale", () => {
    expect(isStale(1_000_000 - 1, 1_000_000, TTL)).toBe(false);
  });
});

// displayableChannels (playable-gated hiding) was removed deliberately: the
// probe verdict is not reliable enough to gate visibility or selection.
// Availability only orders the list and colors the dot — see availability.ts.
