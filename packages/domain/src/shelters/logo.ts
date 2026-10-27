import { z } from "zod";

/**
 * A storage key, never a URL - the same reasoning as `AnimalPhoto`
 * (`packages/domain/src/animals/photo.ts`): variant naming and CDN host
 * belong to the image pipeline, and baking either into stored data would
 * make changing them a data migration.
 *
 * Square by construction (the upload crops it, not this schema) - no `alt`
 * field, unlike `AnimalPhoto`: a shelter's logo has one accessible name,
 * the shelter's own `displayName`, computed at render time rather than
 * stored a second time here.
 */
export const ShelterLogoSchema = z.object({
  storageKey: z.string().min(1),
  width: z.int().positive(),
  height: z.int().positive(),
});
export type ShelterLogo = z.infer<typeof ShelterLogoSchema>;
