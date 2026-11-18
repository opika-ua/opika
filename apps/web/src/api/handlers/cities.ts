import type {
  CitiesByIdsInputSchema,
  CitiesResolveTokensInputSchema,
  CitiesResolveTokensOutputSchema,
  CitiesWithPagesInputSchema,
  CitiesWithPagesOutputSchema,
  CityLabelView,
} from "@opika/contracts";
import { cityRepo, galleryRepo } from "@opika/db/repos";
import type { z } from "zod";
import type { AppContext } from "../context";
import { cityLabelOf } from "./city-labels";

export async function citiesByIds(
  input: z.infer<typeof CitiesByIdsInputSchema>,
  context: AppContext,
): Promise<readonly CityLabelView[]> {
  const found = await cityRepo(context.db).findByIds(input.ids);
  return found.map(cityLabelOf);
}

export async function citiesResolveTokens(
  input: z.infer<typeof CitiesResolveTokensInputSchema>,
  context: AppContext,
): Promise<z.infer<typeof CitiesResolveTokensOutputSchema>> {
  const resolved = await cityRepo(context.db).resolveTokens(input.tokens);
  return resolved.map(({ token, city, via }) => ({
    token,
    city: city ? cityLabelOf(city) : null,
    via,
  }));
}

export async function citiesWithPages(
  input: z.infer<typeof CitiesWithPagesInputSchema>,
  context: AppContext,
): Promise<z.infer<typeof CitiesWithPagesOutputSchema>> {
  const rows = await galleryRepo(context.db).cityPages({
    now: context.now,
    ...(input.ids ? { cityIds: input.ids } : {}),
  });
  return rows.map(({ cityId, species }) => ({ cityId, species }));
}
