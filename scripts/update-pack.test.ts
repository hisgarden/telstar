import { describe, it, expect } from "bun:test";
import { parseArgs } from "./update-pack";

describe("parseArgs", () => {
  it("defaults to the world-news pack path with validation on and no edits", () => {
    const { packPath, edits, validate } = parseArgs([]);
    expect(packPath).toBe("public/packs/world-news.json");
    expect(validate).toBe(true);
    expect(edits.retires ?? []).toEqual([]);
    expect(edits.setUrls ?? []).toEqual([]);
    expect(edits.adds ?? []).toEqual([]);
  });

  it("collects --retire, --set-url, and a positional pack path", () => {
    const { packPath, edits } = parseArgs([
      "custom/pack.json",
      "--retire",
      "CBSNews247.us",
      "--set-url",
      "A.us",
      "https://new/a.m3u8",
    ]);
    expect(packPath).toBe("custom/pack.json");
    expect(edits.retires).toEqual(["CBSNews247.us"]);
    expect(edits.setUrls).toEqual([["A.us", "https://new/a.m3u8"]]);
  });

  it("parses a --add JSON channel object into the adds list", () => {
    const json =
      '{"name":"Scripps News","id":"ScrippsNews.us","country":"us","funding":"commercial","categories":["news"],"url":"https://example.com/scripps.m3u8"}';
    const { edits } = parseArgs(["--retire", "CBSNews247.us", "--add", json]);
    expect(edits.retires).toEqual(["CBSNews247.us"]);
    expect(edits.adds).toHaveLength(1);
    expect(edits.adds?.[0].id).toBe("ScrippsNews.us");
    expect(edits.adds?.[0].url).toBe("https://example.com/scripps.m3u8");
  });

  it("--no-validate turns the liveness probe off", () => {
    expect(parseArgs(["--no-validate"]).validate).toBe(false);
  });

  it("throws a clear error on malformed --add JSON", () => {
    expect(() => parseArgs(["--add", "{not json"])).toThrow(/--add/);
  });
});
