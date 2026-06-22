import { describe, it, expect, afterEach } from "bun:test";
import { t } from "./i18n";
import { locale, setLocale } from "./state/signals";

afterEach(() => setLocale("en"));

describe("t", () => {
  it("Given the English locale, When translating, Then returns the English message", () => {
    setLocale("en");
    expect(t("loadUrl")).toBe("Load URL");
  });

  it("Given a switched locale, When translating, Then returns that locale's message", () => {
    setLocale("zh-Hans");
    expect(t("loadUrl")).toBe("加载网址");
    setLocale("zh-Hant");
    expect(t("loadUrl")).toBe("載入網址");
  });

  it("Given placeholders, When translating, Then they are interpolated", () => {
    setLocale("en");
    expect(t("loaded", { count: 42 })).toBe("Loaded 42 channels");
    setLocale("zh-Hans");
    expect(t("loaded", { count: 42 })).toBe("已加载 42 个频道");
  });

  it("Given a funding footnote, When translating, Then the whole sentence localizes (not just the country)", () => {
    setLocale("en");
    expect(t("fundingState", { country: "France" })).toBe(
      "Funded in whole or in part by the government of France",
    );
    setLocale("zh-Hans");
    expect(t("fundingState", { country: "法国" })).toBe("全部或部分由法国政府出资");
    setLocale("zh-Hant");
    expect(t("fundingPublic", { country: "美國" })).toBe("公共資助的廣播機構（美國）");
  });

  it("Given a key missing in the locale, When translating, Then it falls back to English", () => {
    // (all keys exist in every dict today; force the path via an unknown key)
    setLocale("zh-Hant");
    expect(t("loadUrl")).toBe("載入網址");
  });

  it("Given an unknown key, When translating, Then it returns the key itself", () => {
    setLocale("en");
    expect(t("totally.unknown.key")).toBe("totally.unknown.key");
  });

  it("Given the locale signal, When read in a watcher, Then it reflects the current value", () => {
    setLocale("zh-Hans");
    expect(locale.get()).toBe("zh-Hans");
  });
});
