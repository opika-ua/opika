import { describe, expect, it } from "vitest";
import {
  clampGalleryPage,
  galleryPageCount,
  MAX_GALLERY_NAVIGABLE_ROWS,
  maxNavigablePage,
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

describe("maxNavigablePage", () => {
  it("agrees with the page count at the bound, so the two cannot disagree", () => {
    // The invariant the repository relies on: a page clamped to this is never
    // greater than the `totalPages` the same bound produces, at any page size.
    for (const pageSize of [1, 7, 24, 50]) {
      expect(maxNavigablePage(pageSize)).toBe(
        galleryPageCount(MAX_GALLERY_NAVIGABLE_ROWS, pageSize),
      );
      expect(maxNavigablePage(pageSize)).toBe(
        galleryPageCount(MAX_GALLERY_NAVIGABLE_ROWS * 10, pageSize),
      );
    }
  });

  it("is 84 pages at the gallery's own page size", () => {
    // ~83 pages is the number `docs/standing-constraints.md` names; 2000/24
    // rounds up to 84 because the last page is partial.
    expect(maxNavigablePage(24)).toBe(84);
  });

  it("still has a first page when one page would hold everything", () => {
    expect(maxNavigablePage(MAX_GALLERY_NAVIGABLE_ROWS * 2)).toBe(1);
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
