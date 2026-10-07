import { z } from "zod";
import { AnimalIdSchema, ShelterIdSchema } from "../primitives/ids";
import { LocalizedTextSchema } from "../primitives/localized-text";
import { PublicLocationSchema } from "../shelters/location";
import { AgeEstimateSchema } from "./age";
import { SpayNeuterStatusSchema, VaccinationStatusSchema } from "./attestation";
import { DocumentReadinessSchema } from "./document-readiness";
import { AnimalListingStateSchema } from "./listing";
import { type AnimalPhoto, AnimalPhotoSchema } from "./photo";
import { SizeBucketSchema } from "./size";

/**
 * Closed at dog and cat. Adding a species later is an additive change the
 * exhaustiveness checks turn into a guided edit, whereas an open "other"
 * variant would make the filter permanently unenumerable and would immediately
 * break the weight hints attached to SizeBucket, which describe dogs and cats.
 */
export const AnimalSpeciesSchema = z.enum(["dog", "cat"]);
export type AnimalSpecies = z.infer<typeof AnimalSpeciesSchema>;

export const ANIMAL_SPECIES = ["dog", "cat"] as const satisfies readonly AnimalSpecies[];

export const AnimalSexSchema = z.enum(["male", "female", "unknown"]);
export type AnimalSex = z.infer<typeof AnimalSexSchema>;

/**
 * `lastUpdatedAt` is edit time: when anything on the record last changed. It
 * is not what freshness measures — that is `listing.confirmedAt` (H2-3), when
 * the shelter last said the animal is still looking, which an edit never
 * moves. Kept required because the kabinet shows it ("Чернетку збережено …").
 */
export const AnimalSchema = z.object({
  id: AnimalIdSchema,
  shelterId: ShelterIdSchema,
  name: z.string().min(1),
  species: AnimalSpeciesSchema,
  sex: AnimalSexSchema,
  size: SizeBucketSchema,
  age: AgeEstimateSchema,
  description: LocalizedTextSchema,
  photos: z.array(AnimalPhotoSchema).readonly(),
  vaccination: VaccinationStatusSchema,
  spayNeuter: SpayNeuterStatusSchema,
  documentReadiness: DocumentReadinessSchema,
  listing: AnimalListingStateSchema,
  /**
   * When an animal is fostered away from its shelter, it has its own public
   * location at `city` precision (city + district, no coordinates). When
   * null, the animal is at the shelter and inherits the shelter's
   * `fuzzed_address`-precision public location.
   *
   * No exact foster address is ever stored — a foster home is a private
   * residence. The city centroid is available via `CityView.centroid` and
   * is honestly labelled as such, rather than posing as the animal's
   * position. Built via `animalPublicLocationOf(cityId, district)`.
   */
  publicLocation: PublicLocationSchema.nullable(),
  createdAt: z.date(),
  lastUpdatedAt: z.date(),
});
export type Animal = z.infer<typeof AnimalSchema>;

export const primaryPhoto = (animal: Animal): AnimalPhoto | null => animal.photos[0] ?? null;
