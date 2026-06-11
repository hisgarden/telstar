import { describe, it, expect } from "bun:test";
import { parseM3U } from "./m3u";

// The parser turns untrusted M3U text into the channel model. Language and
// availability are first-class (availability defaults to "unknown" until the
// deferred probe runs); channels with disallowed URL schemes never enter the
// playable set (zero-trust).

const FULL = `#EXTM3U
#EXTINF:-1 tvg-name="CCTV1" tvg-logo="http://logo/cctv1.png" tvg-country="CN" tvg-language="Chinese" tvg-chno="101" group-title="News",CCTV-1 General
https://example.com/cctv1.m3u8`;

describe("parseM3U", () => {
  it("Given a well-formed EXTINF with all attributes, When parsed, Then the Channel fields are populated", () => {
    const { channels } = parseM3U(FULL);
    expect(channels).toHaveLength(1);
    const c = channels[0];
    expect(c.name).toBe("CCTV-1 General");
    expect(c.logo).toBe("http://logo/cctv1.png");
    expect(c.country).toBe("CN");
    expect(c.language).toBe("Chinese");
    expect(c.number).toBe("101");
    expect(c.group).toBe("News");
    expect(c.url).toBe("https://example.com/cctv1.m3u8");
  });

  it("Given any parsed channel, When created, Then availability is 'unknown'", () => {
    const { channels } = parseM3U(FULL);
    expect(channels[0].availability).toBe("unknown");
  });

  it("Given an entry with no tvg-language, When parsed, Then language is null", () => {
    const text = `#EXTM3U
#EXTINF:-1 tvg-logo="http://l/x.png" group-title="Movies",Mystery Channel
https://example.com/mystery.m3u8`;
    const { channels } = parseM3U(text);
    expect(channels).toHaveLength(1);
    expect(channels[0].language).toBeNull();
    expect(channels[0].number).toBeNull();
  });

  it("Given attribute-order variation and extra whitespace, When parsed, Then fields are still extracted", () => {
    const text = `#EXTM3U
#EXTINF:-1   group-title="Sports"   tvg-language="Spanish"   tvg-name="Deportes",Canal Deportes
https://example.com/deportes.m3u8`;
    const { channels } = parseM3U(text);
    expect(channels[0].language).toBe("Spanish");
    expect(channels[0].group).toBe("Sports");
    expect(channels[0].name).toBe("Canal Deportes");
  });

  it("Given a disallowed URL scheme, When parsed, Then that entry is excluded from channels and counted as rejected", () => {
    const text = `#EXTM3U
#EXTINF:-1 tvg-language="English",Good
https://example.com/good.m3u8
#EXTINF:-1,Bad
file:///etc/passwd`;
    const { channels, rejected } = parseM3U(text);
    expect(channels).toHaveLength(1);
    expect(channels[0].name).toBe("Good");
    expect(rejected).toBe(1);
  });

  it("Given empty input, When parsed, Then an empty channel list is returned without throwing", () => {
    expect(parseM3U("").channels).toEqual([]);
    expect(parseM3U("#EXTM3U\n").channels).toEqual([]);
  });

  it("Given an #EXTGRP directive, When parsed, Then it sets the group for the following entry", () => {
    const text = `#EXTM3U
#EXTGRP:Kids
#EXTINF:-1 tvg-language="French",Petit Canal
https://example.com/kids.m3u8`;
    const { channels } = parseM3U(text);
    expect(channels[0].group).toBe("Kids");
  });
});
