import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { CityViewSchema } from "../views/shelter";

/**
 * Unpaginated: one oblast has a bounded, small list of cities, and the filter
 * sheet needs all of them at once. Pagination here would be ceremony.
 */
export const citiesListContract = oc
  .input(z.object({}))
  .output(z.array(CityViewSchema).readonly())
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
