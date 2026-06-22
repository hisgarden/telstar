import { describe, it, expect } from "bun:test";
import { enrichmentIds, runEnrich } from "./enrich-runner";
import type { Channel } from "./model/channel";

function ch(id: string | null): Channel {
  return {
    id,
    name: "C",
    logo: null,
    country: null,
    language: null,
    group: null,
    number: null,
    url: "https://e/x.m3u8",
    availability: "unknown",
    categories: [],
  };
}

describe("enrichmentIds", () => {
  it("Given channels with @feed suffixes and duplicates, When collected, Then it returns unique base ids", () => {
    const ids = enrichmentIds([ch("AndoTV.cn@SD"), ch("AndoTV.cn@HD"), ch("8TV.my")]);
    expect([...ids].sort()).toEqual(["8TV.my", "AndoTV.cn"]);
  });

  it("Given channels with null ids, When collected, Then they are omitted", () => {
    expect(enrichmentIds([ch(null), ch("X.cn")])).toEqual(["X.cn"]);
  });
});

describe("runEnrich (browser/dev guard)", () => {
  it("Given no Tauri runtime, When runEnrich is called, Then it returns the channels unchanged (no-op)", async () => {
    const input = [ch("AndoTV.cn")];
    expect(await runEnrich(input)).toBe(input);
  });
});
