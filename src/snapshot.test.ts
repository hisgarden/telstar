import { describe, it, expect } from "bun:test";
import { cellVisual } from "./snapshot";
import type { Channel } from "./model/channel";

function ch(over: Partial<Channel>): Channel {
  return {
    id: null,
    name: "C",
    logo: null,
    country: null,
    language: null,
    group: null,
    number: null,
    url: "https://e/x.m3u8",
    availability: "unknown",
    categories: [],
    ...over,
  };
}

// The fallback decision (AE7): a cell shows its cached snapshot when present,
// otherwise the channel logo with a country icon — never a bare/blank cell.
describe("cellVisual", () => {
  it("Given a cached snapshot, When resolved, Then it renders the snapshot", () => {
    const v = cellVisual(ch({ logo: "https://e/logo.png", country: "CN" }), "data:image/jpeg;base64,AAA");
    expect(v).toEqual({ kind: "snapshot", src: "data:image/jpeg;base64,AAA" });
  });

  it("Covers AE7. Given no snapshot but a logo, When resolved, Then it falls back to logo + country", () => {
    const v = cellVisual(ch({ logo: "https://e/logo.png", country: "CN" }), null);
    expect(v).toEqual({ kind: "fallback", logo: "https://e/logo.png", country: "CN" });
  });

  it("Covers AE7. Given no snapshot and no logo, When resolved, Then it falls back with a null logo (placeholder) and the country", () => {
    const v = cellVisual(ch({ logo: null, country: "US" }), null);
    expect(v).toEqual({ kind: "fallback", logo: null, country: "US" });
  });

  it("Given an empty-string snapshot, When resolved, Then it is treated as no snapshot (fallback)", () => {
    const v = cellVisual(ch({ logo: "https://e/l.png" }), "");
    expect(v.kind).toBe("fallback");
  });
});
