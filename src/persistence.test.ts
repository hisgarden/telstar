import { describe, it, expect } from "bun:test";
import { cacheKey, parseStoreFile } from "./persistence";
import type { Channel } from "./model/channel";

const channels: Channel[] = [
  {
    id: "CCTV.cn",
    name: "CCTV",
    logo: "http://l/c.png",
    country: "CN",
    language: "Chinese",
    group: "News",
    number: "101",
    url: "https://example.com/cctv.m3u8",
    availability: "live",
    categories: [],
  },
];

describe("cacheKey", () => {
  it("Given a source with no region, When keyed, Then the key is the source", () => {
    expect(cacheKey("https://x/zho.m3u")).toBe("https://x/zho.m3u");
    expect(cacheKey("https://x/zho.m3u", null)).toBe("https://x/zho.m3u");
  });

  it("Given a region filter, When keyed, Then the country slice is appended (order-independent)", () => {
    const a = cacheKey("https://x/eng.m3u", ["us"]);
    const b = cacheKey("https://x/eng.m3u", ["au", "nz"]);
    expect(a).toBe("https://x/eng.m3u#us");
    expect(b).toBe(cacheKey("https://x/eng.m3u", ["nz", "au"])); // sorted → stable
    expect(a).not.toBe(b);
  });
});

describe("parseStoreFile", () => {
  it("Given a current (v3) keyed file, When parsed, Then entries and lastKey round-trip", () => {
    const file = JSON.stringify({
      version: 3,
      lastKey: "k1",
      entries: { k1: { source: "s1", idCountries: ["us"], channels, scannedAt: 123 } },
    });
    const parsed = parseStoreFile(file);
    expect(parsed.lastKey).toBe("k1");
    expect(parsed.entries.k1.channels[0].availability).toBe("live");
    expect(parsed.entries.k1.scannedAt).toBe(123);
  });

  it("Given an older-version cache, When parsed, Then it is discarded (rebuilds clean)", () => {
    const v2 = JSON.stringify({ version: 2, lastKey: "k", entries: { k: { source: "s", channels } } });
    expect(parseStoreFile(v2).entries).toEqual({});
    const v1 = JSON.stringify({ version: 1, source: "https://x/zho.m3u", channels, scannedAt: 9 });
    expect(parseStoreFile(v1).entries).toEqual({});
  });

  it("Given null or corrupt JSON, When parsed, Then it degrades to an empty file", () => {
    expect(parseStoreFile(null).entries).toEqual({});
    expect(parseStoreFile("{ not json").entries).toEqual({});
    expect(parseStoreFile("42").entries).toEqual({});
  });
});
