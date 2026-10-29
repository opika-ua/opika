import type { CitiesResolveTokensOutputSchema } from "@opika/contracts";
import type { z } from "zod";

/** `cities.resolveTokens`' answer for one `misto` token. */
export type CityTokenResolution = z.infer<typeof CitiesResolveTokensOutputSchema>[number];
