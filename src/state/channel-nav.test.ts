import { describe, it, expect } from "bun:test";
import { nextChannel, prevChannel, stepChannel } from "./channel-nav";
import type { Channel } from "../model/channel";

function ch(name: string): Channel {
  return {
    id: null,
    name,
    logo: null,
    country: null,
    language: null,
    group: null,
    number: null,
    url: `https://e/${name}`,
    availability: "unknown",
    categories: [],
  };
}

describe("channel stepping (lock-screen next/prev)", () => {
  const list = [ch("A"), ch("B"), ch("C")];

  it("Given a channel mid-list, When stepping forward, Then the next channel resolves", () => {
    expect(nextChannel(list, "https://e/B")).toBe("https://e/C");
  });

  it("Given a channel mid-list, When stepping back, Then the previous channel resolves", () => {
    expect(prevChannel(list, "https://e/B")).toBe("https://e/A");
  });

  it("Given the last channel, When stepping forward, Then it wraps to the first", () => {
    expect(nextChannel(list, "https://e/C")).toBe("https://e/A");
  });

  it("Given the first channel, When stepping back, Then it wraps to the last", () => {
    expect(prevChannel(list, "https://e/A")).toBe("https://e/C");
  });

  it("Given a URL not in the list (e.g. the demo), When stepping, Then it starts at the first channel", () => {
    expect(nextChannel(list, "https://other/demo.m3u8")).toBe("https://e/A");
    expect(prevChannel(list, null)).toBe("https://e/A");
  });

  it("Given an empty list, When stepping, Then nothing resolves (null)", () => {
    expect(nextChannel([], "https://e/A")).toBeNull();
    expect(prevChannel([], null)).toBeNull();
  });

  it("Given a single-channel list, When stepping either way, Then it resolves to that channel", () => {
    const one = [ch("only")];
    expect(nextChannel(one, "https://e/only")).toBe("https://e/only");
    expect(prevChannel(one, "https://e/only")).toBe("https://e/only");
  });

  it("Given a multi-step delta, When stepping, Then it wraps correctly", () => {
    expect(stepChannel(list, "https://e/A", 4)).toBe("https://e/B"); // 0 → +4 → idx 1
    expect(stepChannel(list, "https://e/A", -1)).toBe("https://e/C");
  });
});
