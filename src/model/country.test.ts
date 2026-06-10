import { describe, it, expect } from "bun:test";
import { countryFlag, countryOfId, countryLabel } from "./country";

describe("countryLabel", () => {
  it("Given flags off, When labelled, Then returns the neutral uppercase code", () => {
    expect(countryLabel("cn", false)).toBe("CN");
    expect(countryLabel("tw", false)).toBe("TW");
  });

  it("Given flags on, When labelled, Then returns the flag emoji", () => {
    expect(countryLabel("us", true)).toBe("🇺🇸");
  });

  it("Given no country, When labelled, Then returns null either way", () => {
    expect(countryLabel(null, true)).toBeNull();
    expect(countryLabel(null, false)).toBeNull();
  });
});

describe("countryOfId", () => {
  it("Given an iptv-org id, When parsed, Then it returns the trailing country code", () => {
    expect(countryOfId("CNN.us")).toBe("us");
    expect(countryOfId("BBCNews.uk")).toBe("uk");
    expect(countryOfId("ChannelNewsAsia.sg")).toBe("sg");
  });

  it("Given an id with an @feed suffix, When parsed, Then the suffix is ignored", () => {
    expect(countryOfId("GuangzhouTV.cn@SD")).toBe("cn");
  });

  it("Given a dotted name, When parsed, Then it returns the LAST segment", () => {
    expect(countryOfId("Some.News.au")).toBe("au");
  });

  it("Given null or no country suffix, When parsed, Then it returns null", () => {
    expect(countryOfId(null)).toBeNull();
    expect(countryOfId("NoCountry")).toBeNull();
    expect(countryOfId("Foo.xyz")).toBeNull();
  });
});

describe("countryFlag", () => {
  it("Given a 2-letter country code, When converted, Then returns the flag emoji", () => {
    expect(countryFlag("CN")).toBe("🇨🇳");
    expect(countryFlag("US")).toBe("🇺🇸");
  });

  it("Given a lowercase or padded code, When converted, Then it is normalized first", () => {
    expect(countryFlag("us")).toBe("🇺🇸");
    expect(countryFlag(" cn ")).toBe("🇨🇳");
  });

  it("Given null, empty, or a non-2-letter value, When converted, Then returns null", () => {
    expect(countryFlag(null)).toBeNull();
    expect(countryFlag("")).toBeNull();
    expect(countryFlag("USA")).toBeNull();
    expect(countryFlag("C1")).toBeNull();
    expect(countryFlag("CN;HK")).toBeNull();
  });
});
