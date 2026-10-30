import type { CityLabelView, GalleryFacetCounts, RegionView } from "@opika/contracts";
import { type CityId, CityIdSchema, type RegionId, RegionIdSchema } from "@opika/domain";
import { placeBookOf } from "./place-book";

/** Two oblasts and three settlements, the same on every gallery test that needs places. */
export const KYIV_OBL = RegionIdSchema.parse("814661e1-67de-532e-a38e-2216d8b521ff");
export const LVIV_OBL = RegionIdSchema.parse("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
export const BROVARY = CityIdSchema.parse("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
export const KYIV = CityIdSchema.parse("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
export const LVIV = CityIdSchema.parse("dddddddd-dddd-4ddd-8ddd-dddddddddddd");

export const REGION_VIEWS: readonly RegionView[] = [
  {
    id: KYIV_OBL,
    slug: "kyivska" as RegionView["slug"],
    label: "Київська",
    short: "Київська обл.",
    neighbours: [LVIV_OBL],
  },
  {
    id: LVIV_OBL,
    slug: "lvivska" as RegionView["slug"],
    label: "Львівська",
    short: "Львівська обл.",
    neighbours: [KYIV_OBL],
  },
];

export const cityLabel = (
  id: CityId,
  slug: string,
  name: string,
  regionId: RegionId = KYIV_OBL,
  overrides: Partial<CityLabelView> = {},
): CityLabelView => ({
  id,
  slug: slug as CityLabelView["slug"],
  kind: "city",
  nameScope: "unique_in_ukraine",
  regionId,
  name,
  regionShort: regionId === LVIV_OBL ? "Львівська обл." : "Київська обл.",
  raion: null,
  ...overrides,
});

export const BROVARY_LABEL = cityLabel(BROVARY, "brovary-kyivska", "Бровари");
export const KYIV_LABEL = cityLabel(KYIV, "kyiv", "Київ", KYIV_OBL, {
  kind: "special_status_city",
});
export const LVIV_LABEL = cityLabel(LVIV, "lviv-lvivska", "Львів", LVIV_OBL);

export const facetCity = (label: CityLabelView, count: number) => ({
  cityId: label.id,
  count,
  label,
});

export const COUNTS: GalleryFacetCounts = {
  cities: [facetCity(BROVARY_LABEL, 4), facetCity(KYIV_LABEL, 9)],
  regions: [{ regionId: KYIV_OBL, count: 13 }],
  ages: { baby: 2, young: 3, adult: 5, senior: 1 },
  sizes: { small: 1, medium: 3, large: 5 },
  sexes: { male: 4, female: 6, unknown: 2 },
  species: { dog: 7, cat: 5 },
};

/** The slug maps a page builds from its labels. */
export const PLACE_BOOK = placeBookOf(REGION_VIEWS, [BROVARY_LABEL, KYIV_LABEL, LVIV_LABEL]);
/** Crimea has no animals in these fixtures: it is listed all the same, like every region. */
export const CRIMEA_REGION = RegionIdSchema.parse("30756d7b-1a9e-598f-afc1-598613672165");
export const REGION_LABELS = {
  [KYIV_OBL]: "Київська",
  [LVIV_OBL]: "Львівська",
  [CRIMEA_REGION]: "АР Крим",
};
