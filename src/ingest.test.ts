import { describe, it, expect } from "bun:test";
import {
  fetchPlaylistText,
  pickPlaylistFile,
  isTauriAvailable,
  DisallowedSourceError,
  TauriUnavailableError,
} from "./ingest";

// Zero-trust (R6): the URL ingest path must refuse any non-http(s) scheme
// before it ever reaches the native core. These cases never touch `invoke` —
// the guard rejects first.

describe("fetchPlaylistText scheme guard", () => {
  it.each([
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/plain,x",
    "blob:https://example.com/abc",
    "ftp://host/list.m3u",
  ])(
    "Given a disallowed scheme (%s), When fetched, Then it rejects before invoking the native core",
    async (url) => {
      await expect(fetchPlaylistText(url)).rejects.toBeInstanceOf(DisallowedSourceError);
    },
  );

  it("Given malformed input, When fetched, Then it rejects as disallowed", async () => {
    await expect(fetchPlaylistText("not a url")).rejects.toBeInstanceOf(DisallowedSourceError);
  });
});

describe("Tauri-unavailable guard (browser/dev preview)", () => {
  it("Given no Tauri runtime, When isTauriAvailable is checked, Then it is false", () => {
    expect(isTauriAvailable()).toBe(false);
  });

  it("Given an allowed URL but no Tauri runtime, When fetched, Then it rejects with TauriUnavailableError (not a raw invoke error)", async () => {
    await expect(fetchPlaylistText("https://example.com/list.m3u")).rejects.toBeInstanceOf(
      TauriUnavailableError,
    );
  });

  it("Given no Tauri runtime, When picking a file, Then it rejects with TauriUnavailableError", async () => {
    await expect(pickPlaylistFile()).rejects.toBeInstanceOf(TauriUnavailableError);
  });
});
