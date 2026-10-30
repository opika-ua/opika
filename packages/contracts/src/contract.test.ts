import { describe, expect, it } from "vitest";
import { contract } from "./contract";
import { FeedListInputSchema } from "./procedures/feed";
import {
  GalleryFacetCountsInputSchema,
  GalleryFacetCountsOutputSchema,
  GalleryListInputSchema,
} from "./procedures/gallery";
import {
  DEFAULT_PAGE_SIZE,
  GALLERY_PAGE_SIZE,
  MAX_GALLERY_PAGE,
  MAX_PAGE_SIZE,
} from "./procedures/pagination";

const procedurePaths = (node: object, prefix = ""): readonly string[] =>
  Object.entries(node).flatMap(([key, value]) => {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    // A contract procedure is a builder instance, not a plain namespace object.
    return value !== null && Object.getPrototypeOf(value) === Object.prototype
      ? procedurePaths(value as object, path)
      : [path];
  });

describe("the contract surface", () => {
  it("exposes exactly the fifteen agreed procedures", () => {
    // Spelled out rather than counted, so adding a procedure is a deliberate
    // edit made while looking at the surface. `gallery.*` joined in Phase E0;
    // `animals.cardsByIds` (S8, the saved page's batch read) joined after it;
    // `animals.neighbours` (pet card PR 2) joined after that; `gallery.facetCounts`
    // (the filter selectors' counts) after that. Nationwide N3 replaced the whole-settlement-list
    // procedure (which no page may ship) with `cities.byIds` and `cities.resolveTokens`,
    // and added `regions.list` (the 27 oblasts, from a constant).
    expect([...procedurePaths(contract)].sort()).toEqual([
      "animals.byId",
      "animals.cardsByIds",
      "animals.neighbours",
      "animals.reveal",
      "cities.byIds",
      "cities.resolveTokens",
      "feed.list",
      "gallery.facetCounts",
      "gallery.list",
      "gallery.relaxationCounts",
      "regions.list",
      "reveals.listMine",
      "session.bootstrap",
      "shelters.byId",
      "swipes.record",
    ]);
  });

  it("keeps reveal separate from swipe recording", () => {
    // Fusing them would make a best-effort analytics write transactional and a
    // ledger write droppable.
    expect(contract.animals.reveal).not.toBe(contract.swipes.record);
  });
});

describe("pagination constants", () => {
  it("pins the values rather than asserting them against themselves", () => {
    // The previous assertions compared parsed output to the same constant they
    // were testing, so raising MAX_PAGE_SIZE to 5000 passed. The cap exists to
    // stop a client asking for the whole table; it has to be pinned literally.
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(MAX_PAGE_SIZE).toBe(50);
  });
});

const ANY_FILTERS = {
  cities: { kind: "any" },
  species: { kind: "any" },
  sizes: { kind: "any" },
  ages: { kind: "any" },
};

describe("gallery pagination input", () => {
  it("pins the gallery's own constants literally", () => {
    // 24 rather than the cursor default of 20 because it fills a grid: it
    // divides evenly by every column count the breakpoints use.
    expect(GALLERY_PAGE_SIZE).toBe(24);
    expect(MAX_GALLERY_PAGE).toBe(2000);
    expect(GALLERY_PAGE_SIZE).toBeLessThanOrEqual(MAX_PAGE_SIZE);
  });

  it("defaults sort, page and page size so a bare URL is a valid request", () => {
    // `/tvaryny` with no query string has to work - it is the indexed entry
    // point, and it degrades to a plain list without JS.
    const parsed = GalleryListInputSchema.parse({ filters: ANY_FILTERS });

    expect(parsed.sort).toBe("freshest");
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(GALLERY_PAGE_SIZE);
  });

  it("refuses a page below the first", () => {
    expect(GalleryListInputSchema.safeParse({ filters: ANY_FILTERS, page: 0 }).success).toBe(false);
  });

  it("refuses a page beyond any that could exist", () => {
    // Not a clamp: at or below the bound, a stale page number is served as the
    // last real page. Above it is a number no surface ever generated.
    expect(
      GalleryListInputSchema.safeParse({ filters: ANY_FILTERS, page: MAX_GALLERY_PAGE + 1 })
        .success,
    ).toBe(false);
  });

  it("refuses a sort mode outside the two the surface offers", () => {
    expect(
      GalleryListInputSchema.safeParse({ filters: ANY_FILTERS, sort: "best_match" }).success,
    ).toBe(false);
  });
});

describe("gallery scope input (the shelter page, DR1-D4)", () => {
  const SHELTER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  it("lists everyone when no scope is sent, so every existing caller is unchanged", () => {
    const parsed = GalleryListInputSchema.parse({ filters: ANY_FILTERS });

    expect(parsed.scope).toEqual({ kind: "everyone" });
  });

  it("gives gallery.facetCounts the same default and the same scope shapes", () => {
    expect(GalleryFacetCountsInputSchema.parse({ filters: ANY_FILTERS }).scope).toEqual({
      kind: "everyone",
    });
    expect(
      GalleryFacetCountsInputSchema.parse({
        filters: ANY_FILTERS,
        scope: { kind: "shelter", shelterId: SHELTER_ID },
      }).scope,
    ).toEqual({ kind: "shelter", shelterId: SHELTER_ID });
    expect(
      GalleryFacetCountsInputSchema.safeParse({
        filters: ANY_FILTERS,
        scope: { kind: "shelter", shelterId: "42" },
      }).success,
    ).toBe(false);
  });

  it("accepts one shelter by id", () => {
    const parsed = GalleryListInputSchema.parse({
      filters: ANY_FILTERS,
      scope: { kind: "shelter", shelterId: SHELTER_ID },
    });

    expect(parsed.scope).toEqual({ kind: "shelter", shelterId: SHELTER_ID });
  });

  it("refuses a shelter id that isn't a UUID", () => {
    for (const shelterId of ["42", "not-a-uuid", "", `${SHELTER_ID}x`]) {
      expect(
        GalleryListInputSchema.safeParse({
          filters: ANY_FILTERS,
          scope: { kind: "shelter", shelterId },
        }).success,
        shelterId,
      ).toBe(false);
    }
  });

  it("refuses a shelter scope with no id, and a scope kind it doesn't know", () => {
    for (const scope of [
      { kind: "shelter" },
      { kind: "city", cityId: SHELTER_ID },
      { kind: "featured" },
      { shelterId: SHELTER_ID },
    ]) {
      expect(
        GalleryListInputSchema.safeParse({ filters: ANY_FILTERS, scope }).success,
        JSON.stringify(scope),
      ).toBe(false);
    }
  });

  it("drops an id sent with the everyone scope rather than narrowing by it", () => {
    const parsed = GalleryListInputSchema.parse({
      filters: ANY_FILTERS,
      scope: { kind: "everyone", shelterId: SHELTER_ID },
    });

    expect(parsed.scope).toEqual({ kind: "everyone" });
  });
});

describe("feed pagination input", () => {
  it("defaults the page size so a client need not choose one", () => {
    const parsed = FeedListInputSchema.parse({
      filters: {
        cities: { kind: "any" },
        species: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      cursor: null,
    });

    expect(parsed.limit).toBe(DEFAULT_PAGE_SIZE);
  });

  it("refuses a page size above the cap", () => {
    const result = FeedListInputSchema.safeParse({
      filters: {
        cities: { kind: "any" },
        species: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      cursor: null,
      limit: MAX_PAGE_SIZE + 1,
    });

    expect(result.success).toBe(false);
  });

  it("refuses an empty cursor, which is a bug rather than a first page", () => {
    const result = FeedListInputSchema.safeParse({
      filters: {
        cities: { kind: "any" },
        species: { kind: "any" },
        sizes: { kind: "any" },
        ages: { kind: "any" },
      },
      cursor: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("gallery facet counts output", () => {
  const CITY = "c1000000-0000-4000-8000-000000000001";
  const REGION = "814661e1-67de-532e-a38e-2216d8b521ff";
  const label = {
    id: CITY,
    slug: "brovary-kyivska",
    kind: "city",
    nameScope: "unique_in_ukraine",
    regionId: REGION,
    name: "Бровари",
    regionShort: "Київська обл.",
    raion: "Броварський район",
  };
  const counts = {
    cities: [{ cityId: CITY, count: 3, label }],
    regions: [{ regionId: REGION, count: 3 }],
    ages: { baby: 1, young: 0, adult: 2, senior: 0 },
    sizes: { small: 1, medium: 1, large: 1 },
    sexes: { male: 2, female: 1, unknown: 0 },
  };

  // Public view: option ids, integers and a city label cross the wire, whatever the handler hands
  // over - a shelter id, a centroid or a KATOTTG code rides along nowhere.
  it("strips anything beyond option ids, counts and the label", () => {
    const parsed = GalleryFacetCountsOutputSchema.parse({
      ...counts,
      cities: [
        {
          cityId: CITY,
          count: 3,
          shelterId: "x",
          label: { ...label, katottgCode: "UA32000000000000000", centroid: { lat: 1, lng: 2 } },
        },
      ],
      totalShelters: 4,
    });
    expect(parsed).toEqual(counts);
  });

  it("refuses a missing option and a negative or fractional count", () => {
    const { senior: _senior, ...threeAges } = counts.ages;
    expect(GalleryFacetCountsOutputSchema.safeParse({ ...counts, ages: threeAges }).success).toBe(
      false,
    );
    expect(
      GalleryFacetCountsOutputSchema.safeParse({ ...counts, sizes: { ...counts.sizes, small: -1 } })
        .success,
    ).toBe(false);
    expect(
      GalleryFacetCountsOutputSchema.safeParse({ ...counts, sexes: { ...counts.sexes, male: 1.5 } })
        .success,
    ).toBe(false);
  });
});
