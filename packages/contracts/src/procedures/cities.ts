import { CityIdSchema } from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { CityLabelViewSchema } from "../views/shelter";

/**
 * There is no "all cities" read in the public API: with every settlement in the table the list is
 * ~30k rows, and nothing on a page needs it. A page asks for the few cities it shows (`byIds`),
 * or turns the city tokens of its own URL into cities (`resolveTokens`). The cities a filter
 * offers come from `gallery.facetCounts`, derived from the animals.
 */
export const MAX_CITY_LABEL_IDS = 50;
export const MAX_CITY_TOKENS = 30;

export const CitiesByIdsInputSchema = z.object({
  ids: z.array(CityIdSchema).max(MAX_CITY_LABEL_IDS),
});

export const citiesByIdsContract = oc
  .input(CitiesByIdsInputSchema)
  .output(z.array(CityLabelViewSchema).readonly())
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });

export const CitiesResolveTokensInputSchema = z.object({
  tokens: z.array(z.string().min(1).max(100)).max(MAX_CITY_TOKENS),
});

/**
 * One entry per distinct token, in the order given. `via` says how it matched: the current slug,
 * a former slug (the caller answers a 308 to the current one), or a pre-slug id. An unknown token
 * is `{ city: null, via: null }`, never an error: a stale link degrades.
 */
export const CitiesResolveTokensOutputSchema = z
  .array(
    z.object({
      token: z.string(),
      city: CityLabelViewSchema.nullable(),
      via: z.enum(["slug", "alias", "id"]).nullable(),
    }),
  )
  .readonly();

export const citiesResolveTokensContract = oc
  .input(CitiesResolveTokensInputSchema)
  .output(CitiesResolveTokensOutputSchema)
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
