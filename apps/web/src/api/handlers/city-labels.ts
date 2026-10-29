import type { CityLabelView } from "@opika/contracts";
import type { Database } from "@opika/db";
import { REGIONS } from "@opika/db";
import { cityRepo } from "@opika/db/repos";
import type { City, CityId, RegionId } from "@opika/domain";

const REGION_SHORT_BY_ID: ReadonlyMap<RegionId, string> = new Map(
  REGIONS.map((region) => [region.id, region.name.ukShort]),
);

/**
 * The public label of a city, `pick`-style: explicit fields only, so the centroid, the KATOTTG code
 * and the search keys cannot reach a response by being added to `City`.
 */
export function cityLabelOf(city: City): CityLabelView {
  return {
    id: city.id,
    slug: city.slug,
    kind: city.kind,
    nameScope: city.nameScope,
    regionId: city.regionId,
    name: city.name.uk,
    regionShort: REGION_SHORT_BY_ID.get(city.regionId) ?? city.regionId,
    raion: city.district?.uk ?? null,
  };
}

/** A card's place: the foster city when it has one, otherwise its shelter's city. */
export const cardCityIdOf = (card: {
  publicLocation: { cityId: CityId } | null;
  shelter: { publicLocation: { cityId: CityId } };
}): CityId => card.publicLocation?.cityId ?? card.shelter.publicLocation.cityId;

/** One batch read (by primary key) for the cities a response mentions. */
export async function cityLabelsFor(
  db: Database,
  cityIds: readonly CityId[],
): Promise<readonly CityLabelView[]> {
  const found = await cityRepo(db).findByIds(cityIds);
  return found.map(cityLabelOf);
}
