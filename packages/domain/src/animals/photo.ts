import { z } from "zod";
import { LocalizedTextSchema } from "../primitives/localized-text.js";

/**
 * A storage key, never a URL: variant naming and CDN host belong to the image
 * pipeline, and baking either into stored data would make changing them a data
 * migration.
 *
 * Intrinsic dimensions travel with the record so a card can reserve its space
 * before the image loads. A deck that reflows mid-swipe feels broken, and that
 * is not a discovery worth postponing until there is a deck to discover it in.
 */
export const AnimalPhotoSchema = z.object({
  storageKey: z.string().min(1),
  width: z.int().positive(),
  height: z.int().positive(),
  alt: LocalizedTextSchema.nullable(),
});
export type AnimalPhoto = z.infer<typeof AnimalPhotoSchema>;

export const aspectRatio = (photo: AnimalPhoto): number => photo.width / photo.height;
