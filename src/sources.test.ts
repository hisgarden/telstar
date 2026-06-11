import { describe, it, expect } from "bun:test";
import { BROWSE_SOURCES, WORLD_NEWS_PACK_KEY, FIFA_PACK_KEY, languagePickAction } from "./sources";
import { DEFAULT_FAVORITE_LANGUAGES } from "./state/view-pref";
import { isAllowedSource } from "./state/source";

// The browse list is shipped data; these invariants guard against a malformed
// or unsafe entry reaching the loader.
describe("BROWSE_SOURCES", () => {
  it("Given the browse list, When checked, Then every URL passes the zero-trust scheme allowlist", () => {
    for (const s of BROWSE_SOURCES) {
      expect(s.urls.length).toBeGreaterThan(0);
      for (const u of s.urls) expect(isAllowedSource(u)).toBe(true);
    }
  });

  it("Given the browse list, When checked, Then every entry has a non-empty key and name", () => {
    for (const s of BROWSE_SOURCES) {
      expect(s.key.trim().length).toBeGreaterThan(0);
      expect(s.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("Given the browse list, When checked, Then keys are unique", () => {
    const keys = BROWSE_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Given the merged Chinese entry, When checked, Then it loads Mandarin + Cantonese + Chinese", () => {
    const cn = BROWSE_SOURCES.find((s) => s.key === "chinese");
    expect(cn?.name).toBe("Chinese");
    expect(cn?.urls).toEqual(
      expect.arrayContaining([
        "https://iptv-org.github.io/iptv/languages/zho.m3u",
        "https://iptv-org.github.io/iptv/languages/cmn.m3u",
        "https://iptv-org.github.io/iptv/languages/yue.m3u",
      ]),
    );
  });

  it("Given the English regions, When checked, Then US/UK/Asia-Pacific exist with country filters", () => {
    const names = BROWSE_SOURCES.filter((s) => s.key.startsWith("eng-")).map((s) => s.name);
    expect(names).toEqual(["English (US)", "English (UK)", "English (Asia Pacific)"]);
    const us = BROWSE_SOURCES.find((s) => s.key === "eng-us");
    expect(us?.idCountries).toEqual(["us"]);
  });

  it("Given Korean and Japanese, When ordered, Then Korean comes before Japanese", () => {
    const ko = BROWSE_SOURCES.findIndex((s) => s.key === "kor");
    const ja = BROWSE_SOURCES.findIndex((s) => s.key === "jpn");
    expect(ko).toBeGreaterThanOrEqual(0);
    expect(ko).toBeLessThan(ja);
  });

  it("Given the default favorites, When checked, Then they all resolve to real browse keys (incl. Chinese)", () => {
    const keys = new Set(BROWSE_SOURCES.map((s) => s.key));
    for (const f of DEFAULT_FAVORITE_LANGUAGES) expect(keys.has(f)).toBe(true);
    expect(DEFAULT_FAVORITE_LANGUAGES).toContain("chinese");
  });
});

// Picking a language must load its full catalog unless a language source is
// already loaded — the curated pack's enrichment-tagged members must never
// substitute for the language's playlists (the stale world-news → Chinese bug).
describe("languagePickAction", () => {
  it("Given the World News pack is loaded, When a pick has loaded members (post-enrichment), Then it loads instead of narrowing", () => {
    expect(languagePickAction(WORLD_NEWS_PACK_KEY, ["Chinese", "Mandarin Chinese"])).toBe("load");
  });

  it("Given the World News pack is loaded, When a pick has no loaded members (pre-enrichment), Then it loads", () => {
    expect(languagePickAction(WORLD_NEWS_PACK_KEY, [])).toBe("load");
  });

  it("Given the FIFA+ pack is loaded, When a language is picked, Then it loads (the pack is not a language catalog)", () => {
    expect(languagePickAction(FIFA_PACK_KEY, ["English"])).toBe("load");
  });

  it("Given a language source is loaded, When the pick's members are present, Then it narrows in place", () => {
    const src = "https://iptv-org.github.io/iptv/languages/zho.m3u|https://iptv-org.github.io/iptv/languages/cmn.m3u";
    expect(languagePickAction(src, ["Mandarin Chinese"])).toBe("narrow");
  });

  it("Given a language source is loaded, When the pick's members are absent, Then it loads", () => {
    expect(languagePickAction("https://iptv-org.github.io/iptv/languages/zho.m3u", [])).toBe("load");
  });

  it("Given nothing is loaded, When picking, Then it loads", () => {
    expect(languagePickAction(null, [])).toBe("load");
  });
});
