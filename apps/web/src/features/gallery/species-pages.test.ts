import { DEFAULT_GALLERY_SORT, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { galleryCanonicalPath, galleryHref, galleryPageHref } from "./filter-url";
import { placeBookOf } from "./place-book";
import { SPECIES_PAGE_MIN_ANIMALS, speciesWithPages } from "./species-pages";
import { BROVARY, BROVARY_LABEL, KYIV_OBL, REGION_VIEWS } from "./test-places";

const dogs: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["dog"] } };

describe("speciesWithPages: the one threshold check", () => {
  it("a species has a page at the threshold and not one below it", () => {
    expect(SPECIES_PAGE_MIN_ANIMALS).toBe(10);
    expect([...speciesWithPages({ dog: 10, cat: 9 })]).toEqual(["dog"]);
    expect([...speciesWithPages({ dog: 0, cat: 0 })]).toEqual([]);
    expect([...speciesWithPages({ dog: 11, cat: 10 })].sort()).toEqual(["cat", "dog"]);
  });
});

describe("gallery links for one species", () => {
  const withPage = placeBookOf(REGION_VIEWS, [BROVARY_LABEL], [], new Set(), new Set(["dog"]));
  const withoutPage = placeBookOf(REGION_VIEWS, [BROVARY_LABEL]);

  it("go to the species page only while it exists, the other filters kept", () => {
    const young: FeedFilters = { ...dogs, ages: { kind: "oneOf", values: ["young"] } };
    expect(galleryHref(young, DEFAULT_GALLERY_SORT, withPage.slugs)).toBe(
      "/tvaryny/vyd/sobaky?vik=young",
    );
    expect(galleryHref(young, DEFAULT_GALLERY_SORT, withoutPage.slugs)).toBe("/?vyd=dog&vik=young");
    expect(galleryPageHref(dogs, DEFAULT_GALLERY_SORT, 2, withPage.slugs)).toBe(
      "/tvaryny/vyd/sobaky?stor=2",
    );
  });

  it("an oblast or another city rides along as a query; a city with its own page wins", () => {
    const inOblast: FeedFilters = { ...dogs, regions: { kind: "oneOf", values: [KYIV_OBL] } };
    expect(galleryHref(inOblast, DEFAULT_GALLERY_SORT, withPage.slugs)).toBe(
      "/tvaryny/vyd/sobaky?obl=kyivska",
    );
    const brovaryPage = placeBookOf(
      REGION_VIEWS,
      [BROVARY_LABEL],
      [],
      new Set([BROVARY]),
      new Set(["dog"]),
    );
    const inBrovary: FeedFilters = { ...dogs, cities: { kind: "oneOf", values: [BROVARY] } };
    expect(galleryHref(inBrovary, DEFAULT_GALLERY_SORT, brovaryPage.slugs)).toBe(
      "/tvaryny/misto/brovary-kyivska?vyd=dog",
    );
    expect(galleryCanonicalPath(inBrovary, DEFAULT_GALLERY_SORT, 1, brovaryPage.slugs)).toBe(
      "/tvaryny/misto/brovary-kyivska",
    );
  });

  it("a shelter page's own base path never moves", () => {
    expect(galleryHref(dogs, DEFAULT_GALLERY_SORT, withPage.slugs, "/prytulky/x")).toBe(
      "/prytulky/x?vyd=dog",
    );
  });

  it("the canonical: the species page, with its page number past page 1", () => {
    expect(galleryCanonicalPath(dogs, "longest_waiting", 1, withPage.slugs)).toBe(
      "/tvaryny/vyd/sobaky",
    );
    expect(galleryCanonicalPath(dogs, DEFAULT_GALLERY_SORT, 4, withPage.slugs)).toBe(
      "/tvaryny/vyd/sobaky?stor=4",
    );
    expect(galleryCanonicalPath(dogs, DEFAULT_GALLERY_SORT, 4, withoutPage.slugs)).toBe("/");
  });
});
