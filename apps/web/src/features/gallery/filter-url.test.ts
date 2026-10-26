import { ANY, type CityId, citySlugOf, NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import {
  type CityIdsBySlug,
  type CitySlugsById,
  deckEntryHref,
  filtersInWords,
  galleryHref,
  galleryPageHref,
  parseDeckQuery,
  parseGalleryQuery,
  redirectHrefForLegacyCityIds,
  resetFiltersHref,
  similarAnimalsHref,
  withToggledAge,
  withToggledCity,
  withToggledCoat,
  withToggledColour,
  withToggledSize,
  withToggledSpecies,
  withToggledTemperament,
} from "./filter-url";

const CITY_A = "11111111-1111-4111-8111-111111111111" as CityId;
const CITY_B = "22222222-2222-4222-8222-222222222222" as CityId;
const SLUG_A = citySlugOf("Brovary");
const SLUG_B = citySlugOf("Kyiv");

const CITY_SLUGS: CitySlugsById = new Map([
  [CITY_A, SLUG_A],
  [CITY_B, SLUG_B],
]);
const CITIES_BY_SLUG: CityIdsBySlug = new Map([
  [SLUG_A, CITY_A],
  [SLUG_B, CITY_B],
]);
const NO_CITIES: CitySlugsById = new Map();
const NO_SLUGS: CityIdsBySlug = new Map();

describe("parseGalleryQuery", () => {
  it("defaults to no filters, the default sort, and page 1 when nothing is present", () => {
    expect(parseGalleryQuery({}, NO_SLUGS)).toEqual({
      filters: NO_FILTERS,
      sort: "freshest",
      page: 1,
    });
  });

  it("parses a comma-separated multi-select dimension", () => {
    const { filters } = parseGalleryQuery({ vyd: "dog,cat" }, NO_SLUGS);
    // Both species selected collapses to "any" - canonicalizeFilters' own rule,
    // exercised here rather than re-asserted, since a multi-value parse is
    // exactly the shape that would hit it first.
    expect(filters.species).toEqual(ANY);
  });

  it("parses a single value from a multi-select dimension", () => {
    const { filters } = parseGalleryQuery({ vyd: "dog" }, NO_SLUGS);
    expect(filters.species).toEqual({ kind: "oneOf", values: ["dog"] });
  });

  it("drops an unrecognised token rather than throwing", () => {
    const { filters } = parseGalleryQuery({ rozmir: "not-a-real-size" }, NO_SLUGS);
    expect(filters.sizes).toEqual(ANY);
  });

  it("drops unrecognised tokens but keeps the recognised ones in the same value", () => {
    const { filters } = parseGalleryQuery({ vik: "baby,not-a-bucket,young" }, NO_SLUGS);
    expect(filters.ages).toEqual({ kind: "oneOf", values: ["baby", "young"] });
  });

  it("parses a city by its slug", () => {
    const { filters } = parseGalleryQuery({ misto: SLUG_A }, CITIES_BY_SLUG);
    expect(filters.cities).toEqual({ kind: "oneOf", values: [CITY_A] });
  });

  it("still accepts a raw CityId - the pre-slug link form, resolved without needing the slug map to know it", () => {
    const { filters } = parseGalleryQuery({ misto: CITY_A }, NO_SLUGS);
    expect(filters.cities).toEqual({ kind: "oneOf", values: [CITY_A] });
  });

  it("drops a well-formed but unknown slug rather than throwing", () => {
    const { filters } = parseGalleryQuery({ misto: "not-a-real-city" }, CITIES_BY_SLUG);
    expect(filters.cities).toEqual(ANY);
  });

  it("falls back to the default sort on an invalid sort value", () => {
    expect(parseGalleryQuery({ sort: "best_match" }, NO_SLUGS).sort).toBe("freshest");
  });

  it("parses a valid non-default sort", () => {
    expect(parseGalleryQuery({ sort: "longest_waiting" }, NO_SLUGS).sort).toBe("longest_waiting");
  });

  it("falls back to page 1 on a non-numeric or out-of-range page", () => {
    expect(parseGalleryQuery({ stor: "abc" }, NO_SLUGS).page).toBe(1);
    expect(parseGalleryQuery({ stor: "0" }, NO_SLUGS).page).toBe(1);
    expect(parseGalleryQuery({ stor: "-3" }, NO_SLUGS).page).toBe(1);
  });

  it("parses a valid page number", () => {
    expect(parseGalleryQuery({ stor: "4" }, NO_SLUGS).page).toBe(4);
  });

  it("keeps every value from a repeated query key, not just the first", () => {
    // A native <form method="GET"> submitting two checked boxes named the
    // same thing produces exactly this shape (?rozmir=small&rozmir=medium)
    // - the real submission FilterSheet relies on, not a synthetic case.
    // Two of three sizes, deliberately not all of them: with all three the
    // result collapses to "any" regardless of whether this bug is present,
    // which would make the assertion pass for the wrong reason.
    // canonicalizeFilters sorts values, so "medium" < "small" alphabetically.
    expect(parseGalleryQuery({ rozmir: ["small", "medium"] }, NO_SLUGS).filters.sizes).toEqual({
      kind: "oneOf",
      values: ["medium", "small"],
    });
  });

  it("keeps every repeated city - cities have no universe to collapse into, so this also covers the no-collapse path", () => {
    expect(parseGalleryQuery({ misto: [SLUG_A, SLUG_B] }, CITIES_BY_SLUG).filters.cities).toEqual({
      kind: "oneOf",
      values: [CITY_A, CITY_B],
    });
  });
});

describe("withToggled*", () => {
  it("adds a value not yet selected", () => {
    expect(withToggledSpecies(NO_FILTERS, "dog")).toEqual({
      ...NO_FILTERS,
      species: { kind: "oneOf", values: ["dog"] },
    });
  });

  it("removes a value already selected", () => {
    const once = withToggledSpecies(NO_FILTERS, "dog");
    expect(withToggledSpecies(once, "dog")).toEqual(NO_FILTERS);
  });

  it("selecting every value in the universe collapses back to any", () => {
    const dogSelected = withToggledSpecies(NO_FILTERS, "dog");
    const both = withToggledSpecies(dogSelected, "cat");
    expect(both.species).toEqual(ANY);
  });

  it("cities have no static universe, so selecting two never collapses", () => {
    const one = withToggledCity(NO_FILTERS, CITY_A);
    const two = withToggledCity(one, CITY_B);
    expect(two.cities.kind).toBe("oneOf");
  });

  it("toggling one dimension leaves the others untouched", () => {
    const withAge = withToggledAge(NO_FILTERS, "baby");
    const withAgeAndSize = withToggledSize(withAge, "small");
    expect(withAgeAndSize.ages).toEqual({ kind: "oneOf", values: ["baby"] });
    expect(withAgeAndSize.sizes).toEqual({ kind: "oneOf", values: ["small"] });
  });
});

describe("galleryHref", () => {
  it("is the bare route with no filters and the default sort", () => {
    expect(galleryHref(NO_FILTERS, "freshest", NO_CITIES)).toBe("/tvaryny");
  });

  it("omits the sort param for the default sort but includes a non-default one", () => {
    expect(galleryHref(NO_FILTERS, "longest_waiting", NO_CITIES)).toBe(
      "/tvaryny?sort=longest_waiting",
    );
  });

  it("writes the city as its slug, not the raw id", () => {
    const filters = withToggledCity(NO_FILTERS, CITY_A);
    expect(galleryHref(filters, "freshest", CITY_SLUGS)).toBe(`/tvaryny?misto=${SLUG_A}`);
  });

  it("drops a city the slug map has no entry for, rather than leaking the raw id", () => {
    const filters = withToggledCity(NO_FILTERS, CITY_A);
    expect(galleryHref(filters, "freshest", NO_CITIES)).toBe("/tvaryny");
  });

  it("round-trips through parseGalleryQuery", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = galleryHref(filters, "longest_waiting", CITY_SLUGS);
    const reparsed = parseGalleryQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
      CITIES_BY_SLUG,
    );
    expect(reparsed).toEqual({ filters, sort: "longest_waiting", page: 1 });
  });

  it("never carries a page param - a filter change always returns to page 1", () => {
    expect(galleryHref(NO_FILTERS, "freshest", NO_CITIES)).not.toContain("stor");
  });
});

describe("resetFiltersHref", () => {
  it("clears every filter but keeps the sort", () => {
    expect(resetFiltersHref("longest_waiting")).toBe("/tvaryny?sort=longest_waiting");
  });
});

describe("galleryPageHref", () => {
  it("page 1 has no stor param - matching sort's absent-param-is-default convention", () => {
    expect(galleryPageHref(NO_FILTERS, "freshest", 1, NO_CITIES)).toBe("/tvaryny");
  });

  it("carries a non-default page as ?stor=N", () => {
    expect(galleryPageHref(NO_FILTERS, "freshest", 3, NO_CITIES)).toBe("/tvaryny?stor=3");
  });

  it("carries filters and sort forward unchanged, unlike galleryHref", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = galleryPageHref(filters, "longest_waiting", 2, CITY_SLUGS);
    const reparsed = parseGalleryQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
      CITIES_BY_SLUG,
    );
    expect(reparsed).toEqual({ filters, sort: "longest_waiting", page: 2 });
  });

  it("orders params the same way galleryHref does, stor last", () => {
    expect(galleryPageHref(NO_FILTERS, "longest_waiting", 2, NO_CITIES)).toBe(
      "/tvaryny?sort=longest_waiting&stor=2",
    );
  });
});

describe("deckEntryHref / parseDeckQuery", () => {
  it("round-trips filters and carries the total through, with no sort/page params at all", () => {
    const filters = withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog");
    const href = deckEntryHref(filters, 34, CITY_SLUGS);

    expect(href).not.toContain("sort=");
    expect(href).not.toContain("stor=");

    const reparsed = parseDeckQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
      CITIES_BY_SLUG,
    );
    expect(reparsed).toEqual({ filters, total: 34 });
  });

  it("an unfiltered gallery produces a bare href with only the total", () => {
    expect(deckEntryHref(NO_FILTERS, 320, NO_CITIES)).toBe("/tvaryny/gortaty?total=320");
  });

  it("parseDeckQuery falls back to null when total is missing - direct navigation, not a filtered click", () => {
    expect(parseDeckQuery({}, NO_SLUGS)).toEqual({ filters: NO_FILTERS, total: null });
  });

  it("parseDeckQuery falls back to null on a garbage total rather than throwing", () => {
    expect(parseDeckQuery({ total: "not-a-number" }, NO_SLUGS)).toEqual({
      filters: NO_FILTERS,
      total: null,
    });
  });

  it("parseDeckQuery falls back to null on an implausibly large total - untrusted input, not rendered verbatim", () => {
    expect(parseDeckQuery({ total: "99999999" }, NO_SLUGS)).toEqual({
      filters: NO_FILTERS,
      total: null,
    });
  });

  it("parseDeckQuery falls back to null on total=0 - deckEntryHref never produces one, so it's already a stale or hand-edited link", () => {
    expect(parseDeckQuery({ total: "0" }, NO_SLUGS)).toEqual({ filters: NO_FILTERS, total: null });
  });

  it("ignores a stray sort/stor param carried over by accident", () => {
    const { filters } = parseDeckQuery(
      { sort: "longest_waiting", stor: "3", total: "10" },
      NO_SLUGS,
    );
    expect(filters).toEqual(NO_FILTERS);
  });
});

describe("filtersInWords", () => {
  const cityNames = new Map([[CITY_A, "Бровари"]]);

  it("names nothing when every dimension is unconstrained", () => {
    expect(filtersInWords(NO_FILTERS, cityNames)).toBeNull();
  });

  it("joins only the dimensions actually constrained, city first", () => {
    const filters = withToggledSize(
      withToggledSpecies(withToggledCity(NO_FILTERS, CITY_A), "dog"),
      "medium",
    );
    expect(filtersInWords(filters, cityNames)).toBe("Бровари · собаки · середній");
  });

  it("an unknown city id (map miss) is dropped rather than rendering 'undefined'", () => {
    const filters = withToggledCity(NO_FILTERS, CITY_B);
    expect(filtersInWords(filters, cityNames)).toBeNull();
  });

  it("multiple selected values in one dimension join with a slash", () => {
    const filters = withToggledAge(withToggledAge(NO_FILTERS, "baby"), "senior");
    expect(filtersInWords(filters, cityNames)).toBe("малюк/літній");
  });
});

describe("redirectHrefForLegacyCityIds", () => {
  it("is a no-op when there is no city param at all", () => {
    expect(redirectHrefForLegacyCityIds({}, "/tvaryny", CITY_SLUGS)).toBeNull();
  });

  it("is a no-op when the city param is already a slug", () => {
    expect(redirectHrefForLegacyCityIds({ misto: SLUG_A }, "/tvaryny", CITY_SLUGS)).toBeNull();
  });

  it("rewrites a raw CityId to its slug", () => {
    expect(redirectHrefForLegacyCityIds({ misto: CITY_A }, "/tvaryny", CITY_SLUGS)).toBe(
      `/tvaryny?misto=${SLUG_A}`,
    );
  });

  it("rewrites every legacy id when the slug map resolves all of them", () => {
    const href = redirectHrefForLegacyCityIds(
      { misto: `${CITY_A},${CITY_B}` },
      "/tvaryny",
      CITY_SLUGS,
    );
    const url = new URL(href ?? "", "http://x");
    expect(url.pathname).toBe("/tvaryny");
    expect(url.searchParams.get("misto")).toBe(`${SLUG_A},${SLUG_B}`);
  });

  it("preserves an already-slugged city alongside a rewritten legacy id, rather than dropping it", () => {
    const href = redirectHrefForLegacyCityIds(
      { misto: `${CITY_A},${SLUG_B}` },
      "/tvaryny",
      CITY_SLUGS,
    );
    const url = new URL(href ?? "", "http://x");
    expect(url.searchParams.get("misto")).toBe(`${SLUG_A},${SLUG_B}`);
  });

  it("does not redirect at all when a legacy id has no entry in the slug map - dropping it would change the result set, and this redirect is permanent", () => {
    const NO_ENTRY_FOR_B: CitySlugsById = new Map([[CITY_A, SLUG_A]]);
    expect(
      redirectHrefForLegacyCityIds({ misto: `${CITY_A},${CITY_B}` }, "/tvaryny", NO_ENTRY_FOR_B),
    ).toBeNull();
  });

  it("does not redirect on an unresolvable id even when it's the only city token", () => {
    expect(redirectHrefForLegacyCityIds({ misto: CITY_B }, "/tvaryny", NO_CITIES)).toBeNull();
  });

  it("preserves every other param byte-for-byte, including repeated ones", () => {
    const href = redirectHrefForLegacyCityIds(
      { misto: CITY_A, vyd: ["dog", "cat"], stor: "3" },
      "/tvaryny",
      CITY_SLUGS,
    );
    const url = new URL(href ?? "", "http://x");
    expect(url.pathname).toBe("/tvaryny");
    expect(url.searchParams.getAll("vyd")).toEqual(["dog", "cat"]);
    expect(url.searchParams.get("stor")).toBe("3");
    expect(url.searchParams.get("misto")).toBe(SLUG_A);
  });

  it("uses the given path - the deck's own route, not the gallery's", () => {
    expect(redirectHrefForLegacyCityIds({ misto: CITY_A }, "/tvaryny/gortaty", CITY_SLUGS)).toBe(
      `/tvaryny/gortaty?misto=${SLUG_A}`,
    );
  });
});

/**
 * Fur (DR1, S3): `sherst`, read and written like the other multi-selects.
 * The expected strings are the URL scheme literally, not built from
 * `GALLERY_PARAM`, so a renamed param fails here.
 */
describe("the fur filter in the URL", () => {
  it("parses `sherst`, comma-joined or repeated, dropping a value it doesn't know", () => {
    expect(parseGalleryQuery({ sherst: "long" }, NO_SLUGS).filters.coatLengths).toEqual({
      kind: "oneOf",
      values: ["long"],
    });
    expect(parseGalleryQuery({ sherst: ["short", "curly"] }, NO_SLUGS).filters.coatLengths).toEqual(
      { kind: "oneOf", values: ["short"] },
    );
  });

  it("both values is no fur filter at all", () => {
    expect(parseGalleryQuery({ sherst: "short,long" }, NO_SLUGS).filters.coatLengths).toEqual(ANY);
  });

  it("round-trips through galleryHref with the other filters and the sort", () => {
    const filters = withToggledCoat(withToggledSpecies(NO_FILTERS, "cat"), "long");
    const href = galleryHref(filters, "longest_waiting", NO_CITIES);
    expect(href).toBe("/tvaryny?vyd=cat&sherst=long&sort=longest_waiting");
    const reparsed = parseGalleryQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
      NO_SLUGS,
    );
    expect(reparsed).toEqual({ filters, sort: "longest_waiting", page: 1 });
  });

  it("is carried into a page link and into the deck", () => {
    const filters = withToggledCoat(NO_FILTERS, "short");
    expect(galleryPageHref(filters, "freshest", 2, NO_CITIES)).toBe("/tvaryny?sherst=short&stor=2");
    const deckHref = deckEntryHref(filters, 5, NO_CITIES);
    expect(deckHref).toBe("/tvaryny/gortaty?sherst=short&total=5");
    expect(
      parseDeckQuery(Object.fromEntries(new URL(deckHref, "http://x").searchParams), NO_SLUGS),
    ).toEqual({ filters, total: 5 });
  });

  it("the deck's header names it in his filter words", () => {
    const filters = withToggledCoat(withToggledSpecies(NO_FILTERS, "dog"), "long");
    expect(filtersInWords(filters, new Map())).toBe("собаки · довгошерсті");
  });

  it("«Скинути» clears it", () => {
    expect(resetFiltersHref("freshest")).toBe("/tvaryny");
  });
});

/**
 * Temperament and colour (pet card PR 1b): `kharakter` and `zabarvlennia`,
 * read and written like `sherst`. Expected strings are the URL scheme
 * literally, never built from `GALLERY_PARAM`, so a renamed param fails here.
 */
describe("the temperament and colour filters in the URL", () => {
  const EVERY_TRAIT =
    "playful,calm,affectionate,energetic,independent,shy,good_with_kids,good_with_cats,good_with_dogs";
  const EVERY_COLOUR = "black,white,grey,ginger,brown,cream,black_white,tricolour,tabby,spotted";

  it("parses `kharakter` and `zabarvlennia`, comma-joined or repeated, dropping what it doesn't know", () => {
    expect(
      parseGalleryQuery({ kharakter: "shy,grumpy,calm" }, NO_SLUGS).filters.temperaments,
    ).toEqual({ kind: "oneOf", values: ["calm", "shy"] });
    expect(
      parseGalleryQuery({ kharakter: ["good_with_cats", "good_with_dogs"] }, NO_SLUGS).filters
        .temperaments,
    ).toEqual({ kind: "oneOf", values: ["good_with_cats", "good_with_dogs"] });
    expect(
      parseGalleryQuery({ zabarvlennia: ["tabby", "smoky"] }, NO_SLUGS).filters.colours,
    ).toEqual({ kind: "oneOf", values: ["tabby"] });
    expect(parseGalleryQuery({ zabarvlennia: "smoky" }, NO_SLUGS).filters.colours).toEqual(ANY);
  });

  it("every trait, or every colour, is no filter at all, read or written", () => {
    expect(parseGalleryQuery({ kharakter: EVERY_TRAIT }, NO_SLUGS).filters.temperaments).toEqual(
      ANY,
    );
    expect(parseGalleryQuery({ zabarvlennia: EVERY_COLOUR }, NO_SLUGS).filters.colours).toEqual(
      ANY,
    );

    // Ticking every option one by one, as the dropdown does, lands back on
    // the bare gallery URL rather than spelling the whole list out.
    const everyTrait = EVERY_TRAIT.split(",").reduce(
      (filters, trait) => withToggledTemperament(filters, trait as never),
      NO_FILTERS,
    );
    expect(galleryHref(everyTrait, "freshest", NO_CITIES)).toBe("/tvaryny");
    const everyColour = EVERY_COLOUR.split(",").reduce(
      (filters, colour) => withToggledColour(filters, colour as never),
      NO_FILTERS,
    );
    expect(galleryHref(everyColour, "freshest", NO_CITIES)).toBe("/tvaryny");
  });

  it("one short of every trait is still a filter", () => {
    const [, ...eight] = EVERY_TRAIT.split(",");
    const href = galleryHref(
      parseGalleryQuery({ kharakter: eight.join(",") }, NO_SLUGS).filters,
      "freshest",
      NO_CITIES,
    );
    expect(new URL(href, "http://x").searchParams.get("kharakter")?.split(",")).toHaveLength(8);
  });

  it("round-trips through galleryHref after fur and before the sort", () => {
    const filters = withToggledColour(
      withToggledTemperament(
        withToggledTemperament(withToggledCoat(NO_FILTERS, "long"), "shy"),
        "calm",
      ),
      "black",
    );
    const href = galleryHref(filters, "longest_waiting", NO_CITIES);
    expect(href).toBe(
      "/tvaryny?sherst=long&kharakter=calm%2Cshy&zabarvlennia=black&sort=longest_waiting",
    );
    const reparsed = parseGalleryQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
      NO_SLUGS,
    );
    expect(reparsed).toEqual({ filters, sort: "longest_waiting", page: 1 });
  });

  it("toggling a trait or a colour off again leaves no filter", () => {
    expect(withToggledTemperament(withToggledTemperament(NO_FILTERS, "shy"), "shy")).toEqual(
      NO_FILTERS,
    );
    expect(withToggledColour(withToggledColour(NO_FILTERS, "cream"), "cream")).toEqual(NO_FILTERS);
  });

  it("is carried into a page link and into the deck", () => {
    const filters = withToggledColour(withToggledTemperament(NO_FILTERS, "shy"), "tabby");
    expect(galleryPageHref(filters, "freshest", 3, NO_CITIES)).toBe(
      "/tvaryny?kharakter=shy&zabarvlennia=tabby&stor=3",
    );
    const deckHref = deckEntryHref(filters, 7, NO_CITIES);
    expect(deckHref).toBe("/tvaryny/gortaty?kharakter=shy&zabarvlennia=tabby&total=7");
    expect(
      parseDeckQuery(Object.fromEntries(new URL(deckHref, "http://x").searchParams), NO_SLUGS),
    ).toEqual({ filters, total: 7 });
  });

  it("the deck's header names them in the filter options' own words", () => {
    const filters = withToggledColour(
      withToggledTemperament(
        withToggledTemperament(withToggledSpecies(NO_FILTERS, "cat"), "shy"),
        "good_with_cats",
      ),
      "black",
    );
    expect(filtersInWords(filters, new Map())).toBe(
      "коти · ладнають з котами/соромʼязливі · чорне",
    );
  });
});

/**
 * The pet card's chip link (A6's URL half; PR 5 renders the chip): species
 * plus exactly one filter, every other filter cleared, the default sort, no
 * city. Each expected href is the URL scheme literally.
 */
describe("similarAnimalsHref", () => {
  it.each([
    ["dog", { dimension: "ages", value: "young" }, "/tvaryny?vyd=dog&vik=young"],
    ["cat", { dimension: "sizes", value: "small" }, "/tvaryny?vyd=cat&rozmir=small"],
    ["dog", { dimension: "coatLengths", value: "long" }, "/tvaryny?vyd=dog&sherst=long"],
    ["cat", { dimension: "temperaments", value: "shy" }, "/tvaryny?vyd=cat&kharakter=shy"],
    [
      "dog",
      { dimension: "colours", value: "black_white" },
      "/tvaryny?vyd=dog&zabarvlennia=black_white",
    ],
  ] as const)("%s + %o → %s", (species, chip, expected) => {
    expect(similarAnimalsHref(species, chip)).toBe(expected);
  });

  it("asks a fresh question: nothing but the species and the chip, the default sort, page 1", () => {
    const href = similarAnimalsHref("cat", { dimension: "temperaments", value: "good_with_dogs" });
    expect(
      parseGalleryQuery(Object.fromEntries(new URL(href, "http://x").searchParams), NO_SLUGS),
    ).toEqual({
      filters: {
        ...NO_FILTERS,
        species: { kind: "oneOf", values: ["cat"] },
        temperaments: { kind: "oneOf", values: ["good_with_dogs"] },
      },
      sort: "freshest",
      page: 1,
    });
  });
});
