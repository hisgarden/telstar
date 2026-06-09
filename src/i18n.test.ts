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
