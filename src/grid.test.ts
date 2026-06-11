import { describe, it, expect } from "bun:test";
import { PAGE_SIZE, pageCount, pageOf, hoverEnter, hoverLeave } from "./grid";

describe("paging", () => {
  it("Given a page size of 64, When counting pages, Then it rounds up (min 1)", () => {
    expect(PAGE_SIZE).toBe(64);
    expect(pageCount(0)).toBe(1);
    expect(pageCount(64)).toBe(1);
    expect(pageCount(65)).toBe(2);
    expect(pageCount(224)).toBe(4);
  });

  it("Given 224 items, When taking a page, Then each page has at most 64 and windows correctly", () => {
    const items = Array.from({ length: 224 }, (_, i) => i);
    expect(pageOf(items, 0)).toHaveLength(64);
    expect(pageOf(items, 0)[0]).toBe(0);
    expect(pageOf(items, 1)[0]).toBe(64);
    expect(pageOf(items, 3)).toHaveLength(224 - 192); // last page = 32
    expect(pageOf(items, 3)[0]).toBe(192);
  });

  it("Given an out-of-range page, When taking it, Then it clamps to the last valid page", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    expect(pageOf(items, 99)[0]).toBe(64); // clamped to page 1 (last)
    expect(pageOf(items, -5)[0]).toBe(0); // clamped to page 0
  });
});

describe("single-preview hover reducer", () => {
  it("Given no preview, When hovering a cell, Then it becomes the preview", () => {
    expect(hoverEnter(null, "a")).toBe("a");
  });

  it("Given a preview, When hovering a different cell, Then the preview switches (only one active)", () => {
    expect(hoverEnter("a", "b")).toBe("b");
  });

  it("Given the active cell, When leaving it, Then the preview clears", () => {
    expect(hoverLeave("a", "a")).toBeNull();
  });

  it("Given leaving a non-active cell, When applied, Then the active preview is preserved (no race clear)", () => {
    expect(hoverLeave("b", "a")).toBe("b");
  });
});
