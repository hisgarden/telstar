import { describe, it, expect } from "bun:test";
import { clockForLanguage, clockForCountry, formatTime, gmtOffset, resolveClock } from "./timezone";

describe("clockForCountry", () => {
  it("Given a mapped country, When resolved, Then returns its representative city + timezone", () => {
    expect(clockForCountry("us")).toEqual({ city: "Washington, D.C.", timeZone: "America/New_York" });
    expect(clockForCountry("au")).toEqual({ city: "Sydney", timeZone: "Australia/Sydney" });
    expect(clockForCountry("uk")).toEqual({ city: "London", timeZone: "Europe/London" });
  });

  it("Given a World News pack country, When resolved, Then returns its capital + timezone", () => {
    expect(clockForCountry("jp")).toEqual({ city: "Tokyo", timeZone: "Asia/Tokyo" });
    expect(clockForCountry("de")).toEqual({ city: "Berlin", timeZone: "Europe/Berlin" });
    expect(clockForCountry("fr")).toEqual({ city: "Paris", timeZone: "Europe/Paris" });
    expect(clockForCountry("qa")).toEqual({ city: "Doha", timeZone: "Asia/Qatar" });
    expect(clockForCountry("kr")).toEqual({ city: "Seoul", timeZone: "Asia/Seoul" });
  });

  it("Given an uppercase country code, When resolved, Then it is matched case-insensitively", () => {
    expect(clockForCountry("JP")).toEqual({ city: "Tokyo", timeZone: "Asia/Tokyo" });
  });

  it("Given null or an unmapped country, When resolved, Then returns null", () => {
    expect(clockForCountry(null)).toBeNull();
    expect(clockForCountry("zz")).toBeNull();
  });
});

const NOON_UTC = new Date("2026-05-30T12:00:00Z");

describe("clockForLanguage", () => {
  it("Given a mapped language, When resolved, Then it returns the home city + timezone", () => {
    expect(clockForLanguage("Korean")).toEqual({ city: "Seoul", timeZone: "Asia/Seoul" });
    expect(clockForLanguage("Chinese")).toEqual({ city: "Beijing", timeZone: "Asia/Shanghai" });
    expect(clockForLanguage("Japanese")).toEqual({ city: "Tokyo", timeZone: "Asia/Tokyo" });
  });

  it("Given null or an unmapped language, When resolved, Then it returns null", () => {
    expect(clockForLanguage(null)).toBeNull();
    expect(clockForLanguage("Klingon")).toBeNull();
    expect(clockForLanguage("Unknown language")).toBeNull();
  });

  it("Given a contested-region language (Tibetan/Uyghur), When resolved, Then no clock is shown", () => {
    expect(clockForLanguage("Tibetan")).toBeNull();
    expect(clockForLanguage("Uyghur")).toBeNull();
  });
});

describe("formatTime", () => {
  it("Given noon UTC, When formatted in Beijing (+08), Then it reads 20:00", () => {
    expect(formatTime(NOON_UTC, "Asia/Shanghai")).toBe("20:00");
  });

  it("Given noon UTC, When formatted in UTC, Then it reads 12:00", () => {
    expect(formatTime(NOON_UTC, "UTC")).toBe("12:00");
  });

  it("Given noon UTC, When formatted in Tokyo (+09), Then it reads 21:00", () => {
    expect(formatTime(NOON_UTC, "Asia/Tokyo")).toBe("21:00");
  });

  it("Given 16:00 UTC, When formatted in Beijing (+08), Then midnight reads 00:00 (24h, not 24:00 or 12:00 AM)", () => {
    expect(formatTime(new Date("2026-05-30T16:00:00Z"), "Asia/Shanghai")).toBe("00:00");
  });
});

describe("gmtOffset", () => {
  it("Given Beijing, When labelled, Then it reads GMT+8", () => {
    expect(gmtOffset(NOON_UTC, "Asia/Shanghai")).toBe("GMT+8");
  });

  it("Given Seoul, When labelled, Then it reads GMT+9", () => {
    expect(gmtOffset(NOON_UTC, "Asia/Seoul")).toBe("GMT+9");
  });
});

describe("resolveClock", () => {
  it("Given a playing channel whose country resolves (NHK → jp), Then Tokyo leads (broadcasterLed)", () => {
    const r = resolveClock({ playingCountry: "jp", dominantLanguage: "English", dominantCountry: "us" });
    expect(r.clock).toEqual({ city: "Tokyo", timeZone: "Asia/Tokyo" });
    expect(r.broadcasterLed).toBe(true);
  });

  it("Given nothing playing, Then it falls back to the dominant load, not broadcaster-led", () => {
    const r = resolveClock({ playingCountry: null, dominantLanguage: "English", dominantCountry: "us" });
    expect(r.clock).toEqual({ city: "Washington, D.C.", timeZone: "America/New_York" });
    expect(r.broadcasterLed).toBe(false);
  });

  it("Given a playing channel whose country is unmapped, Then it falls back (no empty broadcaster clock)", () => {
    const r = resolveClock({ playingCountry: "zz", dominantLanguage: "Korean", dominantCountry: null });
    expect(r.clock).toEqual({ city: "Seoul", timeZone: "Asia/Seoul" });
    expect(r.broadcasterLed).toBe(false);
  });

  it("Given nothing playing and an unmapped dominant load, Then clock is null", () => {
    const r = resolveClock({ playingCountry: null, dominantLanguage: "Klingon", dominantCountry: "zz" });
    expect(r.clock).toBeNull();
    expect(r.broadcasterLed).toBe(false);
  });
});
