import { describe, it, expect } from "bun:test";
import { parsePack, fundingFootnote, MAX_PACK_ENTRIES } from "./pack";

// A pack manifest is untrusted JSON held to a stricter boundary than user
// playlists: https-only URLs, required alpha-2 country + funding, entry cap.
// Invalid entries are dropped; truly malformed input degrades to null, never
// throws.

function chan(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "NHK World",
    url: "https://nhk.example/nhk.m3u8",
    id: "NHKWorld.jp",
    country: "jp",
    funding: "state-funded",
    categories: ["news"],
    ...over,
  };
}

function manifest(channels: unknown[], over: Record<string, unknown> = {}): unknown {
  return { version: 1, channels, removed: [], ...over };
}

describe("parsePack", () => {
  it("Given a valid manifest, When parsed, Then every entry returns with categories present", () => {
    const pack = parsePack(manifest([chan(), chan({ id: "DW.de", country: "de" })]));
    expect(pack?.channels).toHaveLength(2);
    expect(pack?.channels[0].categories).toEqual(["news"]);
    expect(pack?.version).toBe(1);
  });

  it("Given an entry with a non-https URL (incl. http), When parsed, Then it is dropped and the rest parse", () => {
    const pack = parsePack(
      manifest([chan(), chan({ id: "x.de", country: "de", url: "http://insecure/x.m3u8" })]),
    );
    expect(pack?.channels).toHaveLength(1);
    expect(pack?.channels[0].id).toBe("NHKWorld.jp");
  });

  it("Given an entry with a missing or non-alpha-2 country, When parsed, Then it is dropped", () => {
    const pack = parsePack(
      manifest([chan({ country: "Japan" }), chan({ id: "ok.de", country: "de" })]),
    );
    expect(pack?.channels.map((c) => c.id)).toEqual(["ok.de"]);
  });

  it("Given an uppercase ISO country code, When parsed, Then it is accepted and normalized to lowercase", () => {
    const pack = parsePack(manifest([chan({ id: "NHK.jp", country: "JP" })]));
    expect(pack?.channels[0].country).toBe("jp");
  });

  it("Given a non-integer or negative version, When parsed, Then version defaults to 0 (rollback guard)", () => {
    expect(parsePack(manifest([chan()], { version: 1.5 }))?.version).toBe(0);
    expect(parsePack(manifest([chan()], { version: -1 }))?.version).toBe(0);
    expect(parsePack(manifest([chan()], { version: 3 }))?.version).toBe(3);
  });

  it("Given an entry missing name/url/id, When parsed, Then it is dropped without throwing", () => {
    const pack = parsePack(
      manifest([{ url: "https://x/y.m3u8", id: "a.us", country: "us", funding: "commercial" }, chan()]),
    );
    expect(pack?.channels.map((c) => c.id)).toEqual(["NHKWorld.jp"]);
  });

  it("Given an entry with an invalid funding value, When parsed, Then it is dropped", () => {
    const pack = parsePack(manifest([chan({ funding: "billionaire" }), chan({ id: "ok.de", country: "de" })]));
    expect(pack?.channels.map((c) => c.id)).toEqual(["ok.de"]);
  });

  it("Given a manifest exceeding the entry cap, When parsed, Then the whole manifest is rejected", () => {
    const tooMany = Array.from({ length: MAX_PACK_ENTRIES + 1 }, (_, i) => chan({ id: `c${i}.us`, country: "us" }));
    expect(parsePack(manifest(tooMany))).toBeNull();
  });

  it("Given malformed / non-object JSON, When parsed, Then it degrades to null rather than throwing", () => {
    expect(parsePack(null)).toBeNull();
    expect(parsePack("nope")).toBeNull();
    expect(parsePack(42)).toBeNull();
    expect(parsePack({ version: 1 })).toBeNull(); // no channels array
  });

  it("Given a manifest with all-invalid channels, When parsed, Then it returns an empty channel set (not null)", () => {
    const pack = parsePack(manifest([{ junk: true }, chan({ url: "ftp://x/y" })]));
    expect(pack).not.toBeNull();
    expect(pack?.channels).toHaveLength(0);
  });

  it("Given removed tombstones, When parsed, Then they are carried through as strings", () => {
    const pack = parsePack(manifest([chan()], { removed: ["Old.uk", 5, "Gone.fr"] }));
    expect(pack?.removed).toEqual(["Old.uk", "Gone.fr"]);
  });
});

describe("fundingFootnote (YouTube-style wording)", () => {
  it("Given a state-funded outlet, Then it reads the government-funded wording", () => {
    expect(fundingFootnote("state-funded", "Japan")).toBe(
      "Funded in whole or in part by the government of Japan",
    );
  });

  it("Given a public broadcaster, Then it reads the publicly-funded wording", () => {
    expect(fundingFootnote("public-broadcaster", "United States")).toBe(
      "Publicly funded broadcaster (United States)",
    );
  });

  it("Given commercial / newswire / unknown funding, Then no footnote (matches YouTube)", () => {
    expect(fundingFootnote("commercial", "United States")).toBeNull();
    expect(fundingFootnote("newswire", "United Kingdom")).toBeNull();
    expect(fundingFootnote(undefined, "Japan")).toBeNull();
  });
});
