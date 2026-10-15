import type { PublicCityLocationView } from "@opika/contracts";
import type { PublicLocation } from "@opika/domain";

/**
 * The domain location, cut down to what an adopter ever receives: the city
 * (Oleksii, 2026-10-14, inbox EM-Q10: "Fuzzing stays server-side, just not
 * serialized"). Before a reveal (feed, gallery, profile, shelter) and inside
 * one too: the reveal's shelter snapshot (`toView` in `reveal.ts`) carries the
 * same city-only location, since the reveal no longer serves an address.
 *
 * Projected here, in every handler, rather than left to oRPC's output
 * stripping alone. The stripping is real (`implement(contract)`), but a
 * handler that hands the whole domain value to a narrower field typechecks
 * either way, so the projection is what says, at the call site, that the
 * district and the point stay behind.
 */
export const cityOnlyLocationOf = (location: PublicLocation): PublicCityLocationView => ({
  cityId: location.cityId,
});
