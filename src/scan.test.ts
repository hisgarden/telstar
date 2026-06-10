import { describe, it, expect } from "bun:test";
import { scanChannels } from "./scan";
import { TauriUnavailableError } from "./ingest";

// The scan runs in the native core; the headless-testable surface is the
// wrapper's Tauri guard. Concurrency, timeouts, and live/slow/dead
// classification are verified in the native app.

describe("scanChannels", () => {
  it("Given no Tauri runtime, When called, Then it rejects with TauriUnavailableError", async () => {
    await expect(scanChannels(["https://example.com/a.m3u8"])).rejects.toBeInstanceOf(
      TauriUnavailableError,
    );
  });

  it("Given an empty url list, When called without Tauri, Then it still rejects via the guard (no silent pass)", async () => {
    await expect(scanChannels([])).rejects.toBeInstanceOf(TauriUnavailableError);
  });
});
