import { describe, it, expect } from "bun:test";
import { availableCategories, scopeByCategories } from "./genre-pref";
import type { Channel } from "../model/channel";

function ch(name: string, categories: string[]): Channel {
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
    categories,
  };
}

const mixed = [
  ch("A", ["news"]),
  ch("B", ["entertainment", "general"]),
  ch("C", []),
  ch("D", ["news", "general"]),
];

describe("availableCategories", () => {
  it("Given channels with category tags, When listed, Then returns the distinct categories sorted", () => {
    expect(availableCategories(mixed)).toEqual(["entertainment", "general", "news"]);
  });

  it("Given channels with no categories, When listed, Then returns an empty list", () => {
    expect(availableCategories([ch("X", []), ch("Y", [])])).toEqual([]);
  });
});

describe("scopeByCategories", () => {
  it("Given no selection, When scoped, Then all channels pass through", () => {
    expect(scopeByCategories(mixed, [])).toHaveLength(4);
  });

  it("Given a selected category, When scoped, Then only channels tagged with it remain", () => {
    expect(scopeByCategories(mixed, ["news"]).map((c) => c.name)).toEqual(["A", "D"]);
  });

  it("Given multiple selected categories, When scoped, Then channels matching ANY remain", () => {
    expect(scopeByCategories(mixed, ["entertainment", "news"]).map((c) => c.name)).toEqual([
      "A",
      "B",
      "D",
    ]);
  });

  it("Given a selection whose categories are all absent, When scoped, Then it is ignored (no dead-end)", () => {
    expect(scopeByCategories(mixed, ["sports"])).toHaveLength(4);
  });
});
