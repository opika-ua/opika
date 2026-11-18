import type { PlaceSearchResult } from "@opika/contracts";
import { citySearchRepo } from "@opika/db/repos";
import { placeQueryOf, type RegionId } from "@opika/domain";
import type { ShelterReadScope } from "../access";
import type { KabinetContext } from "../context";
import { citySearchKey } from "../rate-limits";

/**
 * `registry.cities.search` and `shelter.cities.search`: the one place search. The query is normalised by the same
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

/**
 * `shelter.cities.search` (owner, 2026-11-18): the same search, charged first against the
 * person's own budget. No limiter (an in-process client) is a refusal, never an unlimited search.
 */
export async function shelterCitiesSearch(
  context: Pick<KabinetContext, "db" | "now" | "citySearchLimiter">,
  scope: ShelterReadScope,
  input: { query: string; regionBias: RegionId | null },
  errors: { RATE_LIMITED: () => Error },
): Promise<PlaceSearchResult> {
  const who =
    scope.kind === "shelter_admin" ? scope.shelterAdminId : `support:${scope.moderatorId}`;
  const limiter = context.citySearchLimiter;
  if (limiter === undefined || !(await limiter.check(citySearchKey(who), context.now))) {
    throw errors.RATE_LIMITED();
  }
  return registryCitiesSearch(context, input);
}
