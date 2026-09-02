import { z } from "zod";
import { LocalizedTextSchema } from "../primitives/localized-text";

/**
 * A storage key, never a URL: variant naming and CDN host belong to the image
 * pipeline, and baking either into stored data would make changing them a data
 * migration.
 *
 * Intrinsic dimensions travel with the record so a card can reserve its space
 * before the image loads. A deck that reflows mid-swipe feels broken, and that
 * is not a discovery worth postponing until there is a deck to discover it in.
 *
 * H1: `width`/`height` are the ORIGINAL uploaded photo's real dimensions
 * (`packages/db/src/image-pipeline/resolve-local-photo.ts`, EXIF-orientation
 * corrected), retained for provenance — not the dimensions of what the
 * browser actually receives. Every real `<Image>` in the app uses
 * `object-fit: cover` inside a fixed-ratio box (`AnimalCard`/
 * `AnimalDetailScreen`), so the served variant is always 4:5 or 1:1
 * regardless of the source's own aspect ratio. `aspectRatio()` below
 * describes the source photo, not any rendered box — it has no call sites
 * today; if one is added, confirm which of the two it actually needs.
 */
export const AnimalPhotoSchema = z.object({
  storageKey: z.string().min(1),
  width: z.int().positive(),
  height: z.int().positive(),
  alt: LocalizedTextSchema.nullable(),
});
export type AnimalPhoto = z.infer<typeof AnimalPhotoSchema>;

export const aspectRatio = (photo: AnimalPhoto): number => photo.width / photo.height;
