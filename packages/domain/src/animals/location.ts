import { z } from "zod";
import { type CityId, CityIdSchema } from "../primitives/ids";
import type { PublicLocation } from "../shelters/location";

/**
 * Where an animal is, as a shelter says it («Де зараз тварина», §12.2): in the shelter's city,
 * following it if the shelter moves, or in a city of its own (a foster, a branch). Stored as
 * `animals.public_location` null or set; `animals.city_id` stays the maintained effective city that
 * the gallery filters and indexes read (P0-5), so app code never handles a bare nullable.
 */
export const AnimalLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shelter_city") }),
  z.object({ kind: z.literal("own_city"), cityId: CityIdSchema }),
]);
export type AnimalLocation = z.infer<typeof AnimalLocationSchema>;

export const effectiveCityId = (location: AnimalLocation, shelterCityId: CityId): CityId =>
  location.kind === "own_city" ? location.cityId : shelterCityId;

/** The row mapping: a null `public_location` is an animal at the shelter. */
export const animalLocationOf = (publicLocation: PublicLocation | null): AnimalLocation =>
  publicLocation === null
    ? { kind: "shelter_city" }
    : { kind: "own_city", cityId: publicLocation.cityId };
