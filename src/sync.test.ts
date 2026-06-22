import { describe, it, expect } from "bun:test";
import { mergeSet, mergeScalar, capList, selectEvictions } from "./sync";

describe("mergeSet", () => {
  it("Given local [a,b] and remote [b,c], When merged, Then the union [a,b,c] (deduped, local order first)", () => {
    expect(mergeSet(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("Given disjoint sets, When merged, Then local items precede remote-only items", () => {
    expect(mergeSet(["x"], ["y", "z"])).toEqual(["x", "y", "z"]);
  });

  it("Given an empty local set, When merged, Then the remote set carries through", () => {
    expect(mergeSet([], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("Given identical sets, When merged, Then no duplicates appear", () => {
    expect(mergeSet(["a", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("Given a merge applied twice, When re-merged with the same remote, Then the result is stable (idempotent)", () => {
    const once = mergeSet(["a", "b"], ["b", "c"]);
    expect(mergeSet(once, ["b", "c"])).toEqual(once);
  });
});

describe("selectEvictions", () => {
  it("Given fewer sources than the cap, When evaluated, Then nothing is evicted", () => {
    expect(selectEvictions({ a: 3, b: 1 }, 5)).toEqual([]);
  });

  it("Given more sources than the cap, When evaluated, Then the oldest-scanned are evicted", () => {
    const evicted = selectEvictions({ a: 30, b: 10, c: 20, d: 40 }, 2);
    expect(evicted.sort()).toEqual(["b", "c"]); // keep the two newest (a:30, d:40)
  });

  it("Given eviction already applied, When re-evaluated on the survivors, Then it is stable", () => {
    const index: Record<string, number> = { a: 30, b: 10, c: 20, d: 40 };
    for (const k of selectEvictions(index, 2)) delete index[k];
    expect(selectEvictions(index, 2)).toEqual([]);
  });
});

describe("mergeScalar", () => {
  it("Given a local value and a present remote value, When merged, Then remote wins (last-writer-wins)", () => {
    expect(mergeScalar("en", "zh-Hans")).toBe("zh-Hans");
  });

  it("Given no remote value (null/undefined), When merged, Then the local value is kept", () => {
    expect(mergeScalar("en", null)).toBe("en");
    expect(mergeScalar("en", undefined)).toBe("en");
  });

  it("Given boolean scalars, When the remote is explicitly false, Then false wins (not treated as absent)", () => {
    expect(mergeScalar(true, false)).toBe(false);
  });
});

describe("capList", () => {
  it("Given a list longer than the cap, When capped, Then only the first N survive", () => {
    expect(capList(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
  });

  it("Given a list within the cap, When capped, Then it is unchanged", () => {
    expect(capList(["a", "b"], 5)).toEqual(["a", "b"]);
  });
});
