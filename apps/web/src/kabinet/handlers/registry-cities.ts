import type { PlaceSearchResult } from "@opika/contracts";
import { citySearchRepo } from "@opika/db/repos";
import { placeQueryOf, type RegionId } from "@opika/domain";
import type { KabinetContext } from "../context";

/**
 * `registry.cities.search`: the operator's place search. The query is normalised by the same
 * `placeQueryOf` the stored keys were built with; retired settlements are excluded in the
 * repository, so no handler can forget to; every region is searched alike. Every field of the answer is named
 * here, the way the view is `pick`ed.
 */
export async function registryCitiesSearch(
  context: Pick<KabinetContext, "db">,
  input: { query: string; regionBias: RegionId | null },
): Promise<PlaceSearchResult> {
  const query = placeQueryOf(input.query);
  if (query.kind === "too_short") return { kind: "too_short" };
  const rows = await citySearchRepo(context.db).search(query, { regionBias: input.regionBias });
  return {
    kind: "results",
    places: rows.map((row) => ({
      id: row.id as never,
      kind: row.kind,
      slug: row.slug as never,
      name: row.nameUk,
      district: row.districtNameUk,
      hromada: row.nameScope === "shared_in_district" ? row.hromadaNameUk : null,
      region: { id: row.regionId, ukShort: row.regionUkShort },
    })),
  };
}
