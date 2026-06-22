import { describe, it, expect } from "bun:test";
import { availableLanguages, availableCountries, scopeChannels } from "./language-pref";
import { UNKNOWN_LANGUAGE } from "./channels";
import type { Channel } from "../model/channel";

function ch(language: string | null, country: string | null, name: string): Channel {
  return {
    id: null,
    name,
    logo: null,
    country,
    language,
    group: null,
    number: null,
    url: `https://e/${name}`,
    availability: "unknown",
    categories: [],
  };
}

const mixed = [
  ch("Chinese", "CN", "A"),
  ch(null, "US", "B"),
  ch("Chinese", "SG", "C"),
  ch("English", "US", "D"),
];

describe("availableLanguages", () => {
  it("Given channels, When listed, Then distinct languages appear with null as 'Unknown language', sorted Unknown-last", () => {
    expect(availableLanguages(mixed)).toEqual(["Chinese", "English", UNKNOWN_LANGUAGE]);
  });
});

describe("availableCountries", () => {
  it("Given a language scope, When listed, Then only countries within that scope appear", () => {
    expect(availableCountries(mixed, ["Chinese"])).toEqual(["CN", "SG"]);
  });
});

describe("scopeChannels", () => {
  it("Given no language selection and no country, When scoped, Then all channels return", () => {
    expect(scopeChannels(mixed, [], null)).toHaveLength(4);
  });

  it("Given a language selection, When scoped, Then only channels in that language return (across countries)", () => {
    const out = scopeChannels(mixed, ["Chinese"], null);
    expect(out.map((c) => c.name)).toEqual(["A", "C"]);
  });

  it("Given 'Unknown language' selected, When scoped, Then null-language channels return", () => {
    const out = scopeChannels(mixed, [UNKNOWN_LANGUAGE], null);
    expect(out.map((c) => c.name)).toEqual(["B"]);
  });

  it("Given a language and a secondary country filter, When scoped, Then both narrow the result", () => {
    const out = scopeChannels(mixed, ["Chinese"], "SG");
    expect(out.map((c) => c.name)).toEqual(["C"]);
  });

  it("Given a selection where none of the languages are present, When scoped, Then it shows all (no dead-end)", () => {
    // e.g. a stale persisted 'Unknown language' after channels became 'Chinese'
    expect(scopeChannels(mixed, ["French"], null)).toHaveLength(4);
    expect(scopeChannels(mixed, ["Unknown language", "Klingon"], null).map((c) => c.name)).toEqual([
      "B",
    ]); // present ones still apply; absent ones are ignored
  });
});
