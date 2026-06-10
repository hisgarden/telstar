import { describe, it, expect } from "bun:test";
import { buildEnrichmentIndex, enrichChannels } from "./enrich";
import type { Channel } from "./channel";

function ch(over: Partial<Channel> & { id: string | null }): Channel {
  return {
    id: over.id,
    name: "C",
    logo: null,
    country: null,
    language: over.language ?? null,
    group: null,
    number: null,
    url: over.url ?? "https://e/x.m3u8",
    availability: "unknown",
    categories: over.categories ?? [],
  };
}

// iptv-org records (raw shapes): channels carry `id` + `categories`; feeds
// carry `channel` + `languages` (iso-639-3 codes).
const channelRecords = [
  { id: "AndoTV.cn", categories: ["religious"] },
  { id: "8TV.my", categories: ["entertainment", "general"] },
];
const feedRecords = [
  { channel: "AndoTV.cn", languages: ["cmn"] },
  { channel: "8TV.my", languages: ["zho"] },
];

describe("buildEnrichmentIndex", () => {
  it("Given channel + feed records, When indexed, Then each id maps to its categories and languages", () => {
    const idx = buildEnrichmentIndex(channelRecords, feedRecords);
    expect(idx.get("AndoTV.cn")).toEqual({ categories: ["religious"], languages: ["cmn"] });
  });

  it("Given malformed records (missing fields / wrong types), When indexed, Then it degrades without throwing", () => {
    const idx = buildEnrichmentIndex(
      [{ id: "X" }, { categories: ["news"] }, "nope", null],
      [{ channel: "X" }, {}, 42],
    );
    expect(idx.get("X")).toEqual({ categories: [], languages: [] });
  });
});

describe("enrichChannels", () => {
  const idx = buildEnrichmentIndex(channelRecords, feedRecords);

  it("Given a channel tvg-id with an @feed suffix, When enriched, Then the base id joins and categories are set", () => {
    const [c] = enrichChannels([ch({ id: "AndoTV.cn@SD" })], idx);
    expect(c.categories).toEqual(["religious"]);
  });

  it("Given a channel with no language and a feed language code, When enriched, Then language is filled (mapped)", () => {
    const [c] = enrichChannels([ch({ id: "AndoTV.cn", language: null })], idx);
    expect(c.language).toBe("Mandarin Chinese");
  });

  it("Given a channel with an explicit language, When enriched, Then its language is NOT overwritten", () => {
    const [c] = enrichChannels([ch({ id: "8TV.my", language: "Cantonese" })], idx);
    expect(c.language).toBe("Cantonese");
    expect(c.categories).toEqual(["entertainment", "general"]);
  });

  it("Given a pack channel with pre-set categories and a matching id, When enriched, Then its categories are NOT overwritten (fill-only)", () => {
    const [c] = enrichChannels([ch({ id: "AndoTV.cn", categories: ["news"] })], idx);
    expect(c.categories).toEqual(["news"]); // pack tag survives; not replaced by ["religious"]
  });

  it("Given a channel with empty categories and a matching id, When enriched, Then categories are filled from iptv-org", () => {
    const [c] = enrichChannels([ch({ id: "AndoTV.cn", categories: [] })], idx);
    expect(c.categories).toEqual(["religious"]);
  });

  it("Given a channel with no matching id, When enriched, Then it passes through unchanged", () => {
    const [c] = enrichChannels([ch({ id: "Unknown.zz", language: null })], idx);
    expect(c.categories).toEqual([]);
    expect(c.language).toBeNull();
  });

  it("Given a channel with a null id, When enriched, Then it passes through unchanged", () => {
    const [c] = enrichChannels([ch({ id: null })], idx);
    expect(c.categories).toEqual([]);
  });
});
