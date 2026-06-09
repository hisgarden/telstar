import { describe, it, expect } from "bun:test";
import { resolveChannel, appendDigit } from "./number-nav";
import type { Channel } from "../model/channel";

function ch(number: string | null, name: string): Channel {
  return {
    id: null,
    name,
    logo: null,
    country: null,
    language: null,
    group: null,
    number,
    url: `https://e/${name}`,
    availability: "unknown",
    categories: [],
  };
}

describe("resolveChannel", () => {
  const numbered = [ch("100", "A"), ch("101", "B"), ch("102", "C")];
  const unnumbered = [ch(null, "A"), ch(null, "B"), ch(null, "C")];

  it("Given channels with tvg-chno, When '101' is typed, Then the channel numbered 101 resolves", () => {
    expect(resolveChannel(numbered, "101")?.name).toBe("B");
  });

  it("Given a numbered list and a number with no match, When typed, Then nothing resolves (null)", () => {
    expect(resolveChannel(numbered, "999")).toBeNull();
  });

  it("Given a list with no numbers, When a number is typed, Then it resolves by 1-based position", () => {
    expect(resolveChannel(unnumbered, "3")?.name).toBe("C");
    expect(resolveChannel(unnumbered, "1")?.name).toBe("A");
  });

  it("Given an out-of-range position on an unnumbered list, When typed, Then nothing resolves", () => {
    expect(resolveChannel(unnumbered, "0")).toBeNull();
    expect(resolveChannel(unnumbered, "99")).toBeNull();
  });

  it("Given an empty channel set, When typed, Then nothing resolves", () => {
    expect(resolveChannel([], "1")).toBeNull();
  });
});

describe("appendDigit", () => {
  it("Given a digit key, When appended, Then it extends the buffer", () => {
    expect(appendDigit("10", "1")).toBe("101");
  });
  it("Given a non-digit key, When appended, Then the buffer is unchanged (null = ignore)", () => {
    expect(appendDigit("10", "a")).toBeNull();
    expect(appendDigit("10", "Enter")).toBeNull();
  });
});
