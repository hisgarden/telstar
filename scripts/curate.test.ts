import { describe, it, expect } from "bun:test";
import { retire, setUrl, addChannel, applyEdits, serializePack } from "./curate";
import { parsePack, type PackManifest, type PackChannel } from "../src/model/pack";

function ch(id: string, url = `https://${id}/index.m3u8`): PackChannel {
  return { name: id, url, id, country: "us", funding: "newswire", categories: ["news"] };
}

function pack(channels: PackChannel[], removed: string[] = [], version = 1): PackManifest {
  return { version, channels, removed };
}

describe("retire", () => {
  it("appends the id to removed[], drops it from channels, and bumps version", () => {
    const p = retire(pack([ch("A.us"), ch("B.uk")]), "A.us");
    expect(p.channels.map((c) => c.id)).toEqual(["B.uk"]);
    expect(p.removed).toEqual(["A.us"]);
    expect(p.version).toBe(2);
  });

  it("is append-only and idempotent: a previously-tombstoned id survives a no-op regen", () => {
    const once = retire(pack([ch("A.us")]), "A.us");
    const twice = retire(once, "A.us");
    expect(twice.removed).toEqual(["A.us"]); // no duplicate
    expect(twice.version).toBe(once.version); // no spurious bump when nothing changes
  });
});

describe("setUrl", () => {
  it("updates only the target channel's url and bumps version", () => {
    const p = setUrl(pack([ch("A.us"), ch("B.uk")]), "A.us", "https://new/a.m3u8");
    expect(p.channels.find((c) => c.id === "A.us")?.url).toBe("https://new/a.m3u8");
    expect(p.channels.find((c) => c.id === "B.uk")?.url).toBe("https://B.uk/index.m3u8");
    expect(p.version).toBe(2);
  });

  it("rejects a non-https url", () => {
    expect(() => setUrl(pack([ch("A.us")]), "A.us", "http://insecure/a.m3u8")).toThrow();
  });
});

describe("addChannel", () => {
  it("adds a valid channel and bumps version", () => {
    const p = addChannel(pack([ch("A.us")]), ch("C.de"));
    expect(p.channels.map((c) => c.id)).toEqual(["A.us", "C.de"]);
    expect(p.version).toBe(2);
  });

  it("rejects a channel that fails validation (non-https url)", () => {
    expect(() => addChannel(pack([ch("A.us")]), ch("X.fr", "http://x/f.m3u8"))).toThrow();
  });

  it("rejects a duplicate id already present in channels[] (no silent dup)", () => {
    const p = pack([ch("A.us"), ch("B.uk")]);
    expect(() => addChannel(p, ch("A.us", "https://other/a.m3u8"))).toThrow();
  });

  it("allows re-adding an id that is only tombstoned in removed[] (un-retire); tombstone is retained", () => {
    const p = pack([ch("A.us")], ["C.de"], 2);
    const next = addChannel(p, ch("C.de"));
    expect(next.channels.map((c) => c.id)).toEqual(["A.us", "C.de"]);
    expect(next.removed).toEqual(["C.de"]); // append-only — tombstone survives
    expect(next.version).toBe(3);
  });
});

describe("applyEdits", () => {
  it("performs a retire+add swap in one call: old id tombstoned & gone, new id added, version bumped per op", () => {
    const p = pack([ch("CBS.us"), ch("B.uk")]); // version 1
    const next = applyEdits(p, { retires: ["CBS.us"], adds: [ch("Scripps.us")] });
    expect(next.channels.map((c) => c.id)).toEqual(["B.uk", "Scripps.us"]);
    expect(next.removed).toEqual(["CBS.us"]);
    expect(next.version).toBe(3); // +1 retire, +1 add
  });

  it("applies set-url edits too and is a no-op (same object identity) when given no edits", () => {
    const p = pack([ch("A.us")]);
    expect(applyEdits(p, {})).toBe(p);
    const withUrl = applyEdits(p, { setUrls: [["A.us", "https://new/a.m3u8"]] });
    expect(withUrl.channels[0].url).toBe("https://new/a.m3u8");
    expect(withUrl.version).toBe(2);
  });

  it("propagates validation failures from addChannel (invalid channel throws)", () => {
    const p = pack([ch("A.us")]);
    expect(() => applyEdits(p, { adds: [ch("X.fr", "http://x/f.m3u8")] })).toThrow();
  });
});

describe("serializePack", () => {
  it("round-trips through parsePack unchanged", () => {
    const p = pack([ch("A.us"), ch("B.uk")], ["X.old"], 3);
    expect(parsePack(JSON.parse(serializePack(p)))).toEqual(p);
  });

  it("is deterministic: identical input serializes byte-identically", () => {
    const p = pack([ch("A.us")]);
    expect(serializePack(p)).toBe(serializePack(p));
  });

  it("ends with a trailing newline", () => {
    expect(serializePack(pack([ch("A.us")])).endsWith("\n")).toBe(true);
  });
});
