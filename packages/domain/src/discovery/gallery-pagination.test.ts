import { describe, expect, it } from "vitest";
import {
  clampGalleryPage,
  galleryPageCount,
  MAX_GALLERY_NAVIGABLE_ROWS,
} from "./gallery-pagination";

const PAGE_SIZE = 24;

describe("galleryPageCount", () => {
  it("has no pages when nothing matches", () => {
    // Not one empty page: "no results" and "one page showing nothing" are
    // different claims and only the first is true.
    expect(galleryPageCount(0, PAGE_SIZE)).toBe(0);
  });

  it("rounds a partial last page up", () => {
    expect(galleryPageCount(1, PAGE_SIZE)).toBe(1);
    expect(galleryPageCount(PAGE_SIZE, PAGE_SIZE)).toBe(1);
    expect(galleryPageCount(PAGE_SIZE + 1, PAGE_SIZE)).toBe(2);
  });

  it("stops at the navigable bound rather than growing with the corpus", () => {
    const atBound = galleryPageCount(MAX_GALLERY_NAVIGABLE_ROWS, PAGE_SIZE);

    expect(galleryPageCount(MAX_GALLERY_NAVIGABLE_ROWS + 1, PAGE_SIZE)).toBe(atBound);
    expect(galleryPageCount(MAX_GALLERY_NAVIGABLE_ROWS * 100, PAGE_SIZE)).toBe(atBound);
  });
});

describe("clampGalleryPage", () => {
  it("leaves a page that exists alone", () => {
    expect(clampGalleryPage(3, 4)).toBe(3);
    expect(clampGalleryPage(4, 4)).toBe(4);
  });

  it("serves the last real page for a stale shared link", () => {
    // The case this exists for: someone sent ?stor=7, animals were adopted,
    // there are four pages now. Not an error, not a bounce to page 1 — that
    // would lose their place and hide what happened.
    expect(clampGalleryPage(7, 4)).toBe(4);
  });

  it("falls back to the first page when nothing matches at all", () => {
    // There is no last page to serve; the caller renders its no-match state
    // from the count, not from the page number.
    expect(clampGalleryPage(7, 0)).toBe(1);
  });

  it("never returns a page below the first", () => {
    expect(clampGalleryPage(0, 4)).toBe(1);
    expect(clampGalleryPage(-3, 4)).toBe(1);
  });
});
