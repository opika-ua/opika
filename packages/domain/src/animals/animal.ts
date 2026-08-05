import { z } from "zod";
import { AnimalIdSchema, ShelterIdSchema } from "../primitives/ids.js";
import { LocalizedTextSchema } from "../primitives/localized-text.js";
import { AgeEstimateSchema } from "./age.js";
import { SpayNeuterStatusSchema, VaccinationStatusSchema } from "./attestation.js";
import { DocumentReadinessSchema } from "./document-readiness.js";
import { AnimalListingStateSchema } from "./listing.js";
import { type AnimalPhoto, AnimalPhotoSchema } from "./photo.js";
import { SizeBucketSchema } from "./size.js";

/**
 * Closed at dog and cat. Adding a species later is an additive change the
 * exhaustiveness checks turn into a guided edit, whereas an open "other"
 * variant would make the filter permanently unenumerable and would immediately
 * break the weight hints attached to SizeBucket, which describe dogs and cats.
 */
export const AnimalSpeciesSchema = z.enum(["dog", "cat"]);
export type AnimalSpecies = z.infer<typeof AnimalSpeciesSchema>;

export const AnimalSexSchema = z.enum(["male", "female", "unknown"]);
export type AnimalSex = z.infer<typeof AnimalSexSchema>;

/**
 * `lastUpdatedAt` is required rather than nullable because the freshness signal
 * is a product property, not a diagnostic. A listing that cannot say when it was
 * last confirmed is a listing the feed cannot be honest about.
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
  createdAt: z.date(),
  lastUpdatedAt: z.date(),
});
export type Animal = z.infer<typeof AnimalSchema>;

export const primaryPhoto = (animal: Animal): AnimalPhoto | null => animal.photos[0] ?? null;
