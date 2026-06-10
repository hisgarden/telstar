import { describe, it, expect } from "bun:test";
import { pushRecent } from "./recents";

describe("pushRecent", () => {
  it("Given a new url, When pushed, Then it goes to the front", () => {
    expect(pushRecent(["b", "c"], "a")).toEqual(["a", "b", "c"]);
  });

  it("Given an existing url, When pushed, Then it moves to the front (no duplicate)", () => {
    expect(pushRecent(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
  });

  it("Given a cap, When pushed beyond it, Then the oldest entries drop off", () => {
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });
});
