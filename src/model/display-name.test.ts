import { describe, it, expect } from "bun:test";
import { shortenChannelName } from "./display-name";

describe("shortenChannelName", () => {
  it("Given a standalone 'TV' word, When shortened, Then it is dropped", () => {
    expect(shortenChannelName("Guangzhou TV")).toBe("Guangzhou");
    expect(shortenChannelName("Hunan TV (2160p)")).toBe("Hunan");
  });

  it("Given resolution / quality markers, When shortened, Then they are removed", () => {
    expect(shortenChannelName("CCTV-13 (1080p)")).toBe("CCTV-13");
    expect(shortenChannelName("Lotus Macau HD 720p (720p)")).toBe("Lotus Macau");
    expect(shortenChannelName("CCTV+ 2 (600p) [Not 24/7]")).toBe("CCTV+ 2");
  });

  it("Given acronyms containing TV, When shortened, Then they are preserved", () => {
    expect(shortenChannelName("CCTV")).toBe("CCTV");
    expect(shortenChannelName("TVB")).toBe("TVB");
    expect(shortenChannelName("tvN")).toBe("tvN");
    expect(shortenChannelName("8TV")).toBe("8TV");
  });

  it("Given a non-resolution parenthetical, When shortened, Then it is kept", () => {
    expect(shortenChannelName("CreaTV Community Channel 15 (San Jose CA) (720p)")).toBe(
      "CreaTV Community Channel 15 (San Jose CA)",
    );
  });

  it("Given a name with nothing to strip, When shortened, Then it is unchanged", () => {
    expect(shortenChannelName("KBS World")).toBe("KBS World");
    expect(shortenChannelName("CNA Originals")).toBe("CNA Originals");
  });

  it("Given a name that would empty out, When shortened, Then it falls back to the original", () => {
    expect(shortenChannelName("TV")).toBe("TV");
  });
});
