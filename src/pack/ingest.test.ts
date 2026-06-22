import { describe, it, expect } from "bun:test";
import { packToChannels } from "./ingest";
import type { PackManifest } from "../model/pack";
import { isHttpsOnly } from "../state/source";

const pack: PackManifest = {
  version: 1,
  removed: [],
  channels: [
    { name: "NHK World-Japan", url: "https://nhk/x.m3u8", id: "NHKWorldJapan.jp", country: "jp", funding: "state-funded", categories: ["news"] },
    { name: "Bloomberg", url: "https://bbg/x.m3u8", id: "Bloomberg.us", country: "us", funding: "commercial", categories: ["business"], logo: "https://bbg/logo.png" },
  ],
};

describe("packToChannels", () => {
  it("Given a resolved pack, When converted, Then categories are carried and country preserved", () => {
    const chans = packToChannels(pack);
    expect(chans[0].categories).toEqual(["news"]);
    expect(chans[0].country).toBe("jp");
    expect(chans[1].categories).toEqual(["business"]);
  });

  it("Given a pack channel, When converted, Then url is https, availability is unknown, language null", () => {
    const [c] = packToChannels(pack);
    expect(isHttpsOnly(c.url)).toBe(true);
    expect(c.availability).toBe("unknown");
    expect(c.language).toBeNull();
  });

  it("Given a pack channel with/without a logo, When converted, Then logo maps or defaults to null", () => {
    const chans = packToChannels(pack);
    expect(chans[0].logo).toBeNull();
    expect(chans[1].logo).toBe("https://bbg/logo.png");
  });
});
