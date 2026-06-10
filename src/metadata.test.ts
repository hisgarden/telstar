import { describe, it, expect } from "bun:test";
import { ensureMetadata, lookupMetadata } from "./metadata";

// The metadata cache lives in the native core; the headless-testable surface is
// the wrapper's Tauri guard. Fetch/cache/lookup are verified in the native app.

describe("metadata wrapper (browser/dev guard)", () => {
  it("Given no Tauri runtime, When ensureMetadata is called, Then it returns false (no-op)", async () => {
    expect(await ensureMetadata()).toBe(false);
  });

  it("Given no Tauri runtime, When lookupMetadata is called, Then it returns an empty result (no throw)", async () => {
    expect(await lookupMetadata(["AndoTV.cn", "8TV.my"])).toEqual({ channels: [], feeds: [] });
  });
});
