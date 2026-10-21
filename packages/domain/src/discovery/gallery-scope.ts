import { z } from "zod";
import { ShelterIdSchema } from "../primitives/ids";

/**
 * Whose animals a gallery page lists.
 *
 * Lives here rather than in the contract package for the same reason as
 * `GallerySortSchema`: the query layer reads it and cannot depend on contracts.
 *
 * A union rather than an optional `shelterId`, so "everyone" is a stated
 * answer and not the absence of one: a caller that drops the field by mistake
 * and a caller that means the whole registry look different in the code that
 * reads them. A shelter's public page lists its animals through this, not
 * through a second paginated procedure, so it stays inside the one named
 * `OFFSET` exception (`docs/standing-constraints.md`) and orders by the same
 * two date sorts as the gallery (commitment 1: nothing else orders a list).
 */
export const GalleryScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("everyone") }),
  z.object({ kind: z.literal("shelter"), shelterId: ShelterIdSchema }),
]);
export type GalleryScope = z.infer<typeof GalleryScopeSchema>;

/** Every caller that existed before the shelter page meant this. */
export const EVERYONE_SCOPE: GalleryScope = Object.freeze({ kind: "everyone" });
