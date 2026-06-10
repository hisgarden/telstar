import { describe, it, expect } from "bun:test";
import { languageFromSourceUrl, tagChannelsLanguage, localizedLanguageName } from "./language";
import type { Channel } from "./channel";

function ch(language: string | null, url: string): Channel {
  return {
    id: null,
    name: "C",
    logo: null,
    country: null,
    language,
    group: null,
    number: null,
    url,
    availability: "unknown",
    categories: [],
  };
}

describe("localizedLanguageName (Intl.DisplayNames)", () => {
  it("Given the English UI locale, When mapped, Then it returns the English name", () => {
    expect(localizedLanguageName("Chinese", "en")).toBe("Chinese");
    expect(localizedLanguageName("spa", "en")).toBe("Spanish");
    expect(localizedLanguageName("ara", "en")).toBe("Arabic");
  });

  it("Given a non-English locale, When mapped, Then it returns the name in that locale's script", () => {
    expect(localizedLanguageName("English", "zh-Hans")).toBe("英语");
    expect(localizedLanguageName("Spanish", "zh-Hans")).toBe("西班牙语");
    expect(localizedLanguageName("English", "ja")).toBe("英語");
    expect(localizedLanguageName("English", "ar")).toBe("الإنجليزية");
  });

  it("Given a Latin-script locale, When mapped, Then the first letter is capitalized", () => {
    // Intl returns "français" (lowercase) for fr; we capitalize for display.
    expect(localizedLanguageName("French", "fr")).toBe("Français");
  });

  it("Given an unmapped language, When mapped, Then it degrades to the input", () => {
    expect(localizedLanguageName("Klingon", "zh-Hans")).toBe("Klingon");
  });
});

describe("languageFromSourceUrl", () => {
  it("Given an iptv-org per-language URL (zho), When resolved, Then it returns 'Chinese'", () => {
    expect(languageFromSourceUrl("https://iptv-org.github.io/iptv/languages/zho.m3u")).toBe(
      "Chinese",
    );
  });

  it.each([
    ["eng", "English"],
    ["spa", "Spanish"],
    ["ara", "Arabic"],
    ["cmn", "Mandarin Chinese"],
    ["yue", "Cantonese"],
    ["nan", "Min Nan"],
    ["bod", "Tibetan"],
    ["uig", "Uyghur"],
    ["hmn", "Hmong"],
  ])("Given a known code (%s), When resolved, Then it maps to %s", (code, name) => {
    expect(languageFromSourceUrl(`https://iptv-org.github.io/iptv/languages/${code}.m3u`)).toBe(
      name,
    );
  });

  it("Given a non-iptv-org URL, When resolved, Then it returns null (no language derivable)", () => {
    expect(languageFromSourceUrl("https://example.com/my-list.m3u")).toBeNull();
    expect(languageFromSourceUrl("/Users/me/local.m3u")).toBeNull();
  });

  it("Given a local file named with a known ISO code (zho.m3u), When resolved, Then it maps to Chinese", () => {
    expect(languageFromSourceUrl("/Users/me/Downloads/zho.m3u")).toBe("Chinese");
    expect(languageFromSourceUrl("eng.m3u8")).toBe("English");
  });

  it("Given a local file whose basename is not a known code, When resolved, Then it returns null (no false guess)", () => {
    expect(languageFromSourceUrl("/Users/me/abc.m3u")).toBeNull();
  });

  it("Given an unknown ISO code in the pattern, When resolved, Then it degrades to the raw code rather than throwing", () => {
    expect(languageFromSourceUrl("https://iptv-org.github.io/iptv/languages/zzz.m3u")).toBe("zzz");
  });
});

describe("tagChannelsLanguage", () => {
  it("Given untagged channels and a language, When tagged, Then null-language channels inherit it", () => {
    const out = tagChannelsLanguage([ch(null, "https://e/a"), ch(null, "https://e/b")], "Chinese");
    expect(out.every((c) => c.language === "Chinese")).toBe(true);
  });

  it("Given a mix of tagged and untagged, When tagged, Then already-tagged channels are untouched", () => {
    const out = tagChannelsLanguage([ch("Cantonese", "https://e/a"), ch(null, "https://e/b")], "Chinese");
    expect(out[0].language).toBe("Cantonese");
    expect(out[1].language).toBe("Chinese");
  });

  it("Given a null language to tag with, When applied, Then channels are returned unchanged", () => {
    const input = [ch(null, "https://e/a")];
    expect(tagChannelsLanguage(input, null)).toEqual(input);
  });
});
