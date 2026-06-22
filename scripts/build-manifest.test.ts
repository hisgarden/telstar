import { describe, it, expect } from "bun:test";
import { buildManifest } from "./build-manifest";
import { parsePack, type PackManifest, type PackChannel } from "../src/model/pack";

function ch(id: string): PackChannel {
  return { name: id, url: `https://${id}/index.m3u8`, id, country: "us", funding: "newswire", categories: ["news"] };
}
const pack: PackManifest = { version: 4, channels: [ch("A.us"), ch("B.uk")], removed: ["X.old"] };

describe("buildManifest", () => {
  it("round-trips through parsePack unchanged", () => {
    expect(parsePack(JSON.parse(buildManifest(pack)))).toEqual(pack);
  });

  it("carries version and removed tombstones over verbatim", () => {
    const out = parsePack(JSON.parse(buildManifest(pack)))!;
    expect(out.version).toBe(4);
    expect(out.removed).toEqual(["X.old"]);
  });

  it("is deterministic across runs on identical input", () => {
    expect(buildManifest(pack)).toBe(buildManifest(pack));
  });
});
