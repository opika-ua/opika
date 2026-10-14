import type { PublicCityLocationView } from "@opika/contracts";
import type { PublicLocation } from "@opika/domain";

/**
 * The domain location, cut down to what an adopter receives before a reveal:
 * the city (Oleksii, 2026-10-14, inbox EM-Q10: "Fuzzing stays server-side,
 * just not serialized").
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
