import { describe, expect, it } from "vitest";
import { paginationWindow } from "./gallery-pagination";

describe("paginationWindow", () => {
  it("returns nothing for zero pages", () => {
    expect(paginationWindow(1, 0)).toEqual([]);
  });

  it("returns a single page with no ellipsis", () => {
    expect(paginationWindow(1, 1)).toEqual([1]);
  });

  it("shows every page at or below the threshold, no ellipsis", () => {
    expect(paginationWindow(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(paginationWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("the transition is at exactly 7 -> 8, and 8 is the first windowed total", () => {
    // The boundary the constant's own name states, asserted on both sides
    // from the same current page: a `<` instead of `<=` in the threshold
    // check would abbreviate 7 pages that fit fine, and a `<=` on 8 would
    // draw all 8 the window exists to avoid.
    expect(paginationWindow(4, 7)).toHaveLength(7);
    expect(paginationWindow(4, 8)).toEqual([1, "ellipsis", 3, 4, 5, "ellipsis", 8]);
  });

  it("windows around the current page once past the threshold, ellipsis on both sides", () => {
    expect(paginationWindow(5, 10)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  });

  it("collapses the ellipsis when the band touches page 1 — no gap of one", () => {
    expect(paginationWindow(1, 10)).toEqual([1, 2, "ellipsis", 10]);
    expect(paginationWindow(2, 10)).toEqual([1, 2, 3, "ellipsis", 10]);
  });

  it("collapses the ellipsis when the band touches the last page", () => {
    expect(paginationWindow(10, 10)).toEqual([1, "ellipsis", 9, 10]);
    expect(paginationWindow(9, 10)).toEqual([1, "ellipsis", 8, 9, 10]);
  });

  it("never repeats a page number even where the band overlaps the edges", () => {
    // total=8 (just past the threshold): current=2's band {1,2,3} already
    // covers page 1, so the anchor 1 must not appear twice in the output.
    const window = paginationWindow(2, 8);
    expect(window).toEqual([1, 2, 3, "ellipsis", 8]);
    expect(new Set(window.filter((item) => item !== "ellipsis")).size).toBe(
      window.filter((item) => item !== "ellipsis").length,
    );
  });

  it("worst case (current mid-range, large total) stays at 5 numbers + 2 ellipses", () => {
    const window = paginationWindow(40, 83);
    expect(window).toEqual([1, "ellipsis", 39, 40, 41, "ellipsis", 83]);
  });
});
