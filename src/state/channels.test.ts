import { describe, it, expect, beforeEach } from "bun:test";
import { computed } from "@lit-labs/signals";
import { channels, setChannels, currentSource, setCurrentSource } from "./signals";
import { selectChannel, groupByLanguage, orderByRecency } from "./channels";
import type { Channel } from "../model/channel";

function ch(partial: Partial<Channel> & { url: string }): Channel {
  return {
    id: partial.id ?? null,
    name: partial.name ?? "Channel",
    logo: partial.logo ?? null,
    country: partial.country ?? null,
    language: partial.language ?? null,
    group: partial.group ?? null,
    number: partial.number ?? null,
    url: partial.url,
    availability: partial.availability ?? "unknown",
    categories: partial.categories ?? [],
  };
}

const VALID = ch({ name: "CCTV", language: "Chinese", url: "https://example.com/cctv.m3u8" });

describe("selectChannel", () => {
  beforeEach(() => setCurrentSource(null));

  it("Given a channel, When selected, Then currentSource becomes its URL and it returns true", () => {
    const ok = selectChannel(VALID);
    expect(ok).toBe(true);
    expect(currentSource.get()).toBe(VALID.url);
  });

  it("Given a channel with a disallowed URL, When selected, Then currentSource is unchanged and it returns false", () => {
    const bad = ch({ name: "Bad", url: "file:///etc/passwd" });
    const ok = selectChannel(bad);
    expect(ok).toBe(false);
    expect(currentSource.get()).toBeNull();
  });
});

describe("groupByLanguage", () => {
  it("Given channels with mixed and null languages, When grouped, Then null-language channels fall under 'Unknown language'", () => {
    const list = [
      ch({ name: "A", language: "Chinese", url: "https://e/a.m3u8" }),
      ch({ name: "B", language: null, url: "https://e/b.m3u8" }),
      ch({ name: "C", language: "Chinese", url: "https://e/c.m3u8" }),
    ];
    const groups = groupByLanguage(list);
    const byLang = Object.fromEntries(groups.map((g) => [g.language, g.channels.length]));
    expect(byLang["Chinese"]).toBe(2);
    expect(byLang["Unknown language"]).toBe(1);
  });
});

describe("channels signal", () => {
  it("Given the channels signal updates, When a watcher reads it, Then it observes the new list", () => {
    const watched = computed(() => channels.get().length);
    setChannels([VALID]);
    expect(watched.get()).toBe(1);
    setChannels([]);
    expect(watched.get()).toBe(0);
  });
});

describe("orderByRecency", () => {
  const list = [
    ch({ name: "A", url: "https://e/a.m3u8" }),
    ch({ name: "B", url: "https://e/b.m3u8" }),
    ch({ name: "C", url: "https://e/c.m3u8" }),
  ];

  it("Given no recents, When ordered, Then the input order is preserved", () => {
    expect(orderByRecency(list, []).map((c) => c.name)).toEqual(["A", "B", "C"]);
  });

  it("Given a recently-selected channel, When ordered, Then it moves to the top", () => {
    expect(orderByRecency(list, ["https://e/c.m3u8"]).map((c) => c.name)).toEqual(["C", "A", "B"]);
  });

  it("Given multiple recents, When ordered, Then most-recent leads, rest keep order", () => {
    const recent = ["https://e/b.m3u8", "https://e/a.m3u8"]; // B most recent, then A
    expect(orderByRecency(list, recent).map((c) => c.name)).toEqual(["B", "A", "C"]);
  });

  it("Given a recent URL no longer in the list, When ordered, Then it is ignored", () => {
    expect(orderByRecency(list, ["https://e/gone.m3u8"]).map((c) => c.name)).toEqual(["A", "B", "C"]);
  });
});
