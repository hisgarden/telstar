import { describe, it, expect } from "bun:test";
import { toVerdictMap, mergeVerdicts, encodeVerdicts, decodeVerdicts } from "./verdicts";
import type { Channel } from "./channel";

function ch(url: string, availability: Channel["availability"]): Channel {
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

describe("toVerdictMap", () => {
  it("Given scanned channels, When compacted, Then only known verdicts are kept (unknown omitted)", () => {
    const map = toVerdictMap([
      ch("https://e/a", "live"),
      ch("https://e/b", "dead"),
      ch("https://e/c", "unknown"),
      ch("https://e/d", "slow"),
    ]);
    expect(map).toEqual({ "https://e/a": "live", "https://e/b": "dead", "https://e/d": "slow" });
  });
});

describe("mergeVerdicts", () => {
  it("Given an unscanned channel and a synced verdict, When merged, Then it adopts the verdict", () => {
    const out = mergeVerdicts([ch("https://e/a", "unknown")], { "https://e/a": "live" });
    expect(out[0].availability).toBe("live");
  });

  it("Given a locally-scanned channel, When merged, Then the local verdict wins (this device's network)", () => {
    const out = mergeVerdicts([ch("https://e/a", "dead")], { "https://e/a": "live" });
    expect(out[0].availability).toBe("dead");
  });

  it("Given no matching verdict, When merged, Then the channel is unchanged", () => {
    const out = mergeVerdicts([ch("https://e/a", "unknown")], { "https://e/other": "live" });
    expect(out[0].availability).toBe("unknown");
  });

  it("Given a round-trip, When compacted then merged into fresh channels, Then verdicts transfer", () => {
    const scanned = [ch("https://e/a", "live"), ch("https://e/b", "dead")];
    const fresh = [ch("https://e/a", "unknown"), ch("https://e/b", "unknown")];
    const merged = mergeVerdicts(fresh, toVerdictMap(scanned));
    expect(merged.map((c) => c.availability)).toEqual(["live", "dead"]);
  });
});

describe("encodeVerdicts / decodeVerdicts", () => {
  it("Given a verdict map, When encoded, Then single-char codes are produced with the scan time", () => {
    const synced = encodeVerdicts({ "https://e/a": "live", "https://e/b": "dead", "https://e/c": "slow" }, 42);
    expect(synced).toEqual({ scannedAt: 42, map: { "https://e/a": "l", "https://e/b": "d", "https://e/c": "s" } });
  });

  it("Given encoded verdicts, When round-tripped, Then the original verdict map is recovered", () => {
    const original = { "https://e/a": "live", "https://e/b": "slow" } as const;
    const back = decodeVerdicts(encodeVerdicts(original, 1));
    expect(back).toEqual({ "https://e/a": "live", "https://e/b": "slow" });
  });

  it("Given a malformed or null payload, When decoded, Then it degrades to an empty map", () => {
    expect(decodeVerdicts(null)).toEqual({});
    expect(decodeVerdicts(undefined)).toEqual({});
    // unknown codes are dropped
    expect(decodeVerdicts({ scannedAt: 1, map: { "https://e/a": "x", "https://e/b": "l" } })).toEqual({
      "https://e/b": "live",
    });
  });
});
