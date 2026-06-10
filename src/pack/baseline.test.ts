import { describe, it, expect } from "bun:test";
import baseline from "../../public/packs/world-news.json";
import { parsePack } from "../model/pack";
import { isHttpsOnly } from "../state/source";

// Validates the SHIPPED baseline pack content (not liveness — that's a
// curation-time check per docs/curation.md). Every entry must clear the same
// gate parsePack enforces at runtime, so nothing is silently dropped.

const pack = parsePack(baseline);
const rawCount = (baseline as { channels: unknown[] }).channels.length;

describe("world-news baseline pack", () => {
  it("Given the shipped baseline, When parsed, Then it is a valid manifest", () => {
    expect(pack).not.toBeNull();
  });

  it("Given the shipped baseline, When parsed, Then no entry is dropped (every entry passes the gate)", () => {
    expect(pack!.channels.length).toBe(rawCount);
    expect(pack!.channels.length).toBeGreaterThan(0);
  });

  it("Given each baseline channel, Then its URL is https", () => {
    for (const c of pack!.channels) expect(isHttpsOnly(c.url)).toBe(true);
  });

  it("Given each baseline channel, Then it has name, id, alpha-2 country, funding, and >=1 category", () => {
    for (const c of pack!.channels) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.id.length).toBeGreaterThan(0);
      expect(c.country).toMatch(/^[a-z]{2}$/);
      expect(c.funding).toBeDefined();
      expect(c.categories.length).toBeGreaterThan(0);
    }
  });

  it("Given the baseline, Then channel URLs and ids are unique", () => {
    const urls = pack!.channels.map((c) => c.url);
    const ids = pack!.channels.map((c) => c.id);
    expect(new Set(urls).size).toBe(urls.length);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
