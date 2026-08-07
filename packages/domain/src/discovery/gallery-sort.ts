import { z } from "zod";

/**
 * How a browsable list of animals is ordered.
 *
 * Lives here rather than in the contract package because both the API contract
 * and the query layer need it, and the query layer cannot depend on the
 * contract package.
 *
 * Deliberately closed at two, and deliberately without a "best match" mode: the
 * list surface's premise is that the order is stated, understandable and
 * reproducible from a shared URL. The deck's `scoreAnimal` re-ranking is the
 * opposite bargain — it is a function of freshness decay, so it reorders the
 * same rows as time passes. That is right for a one-at-a-time deck and wrong
 * for a page someone sent to a friend, so no sort mode here maps to it.
 */
export const GallerySortSchema = z.enum(["freshest", "longest_waiting"]);
export type GallerySort = z.infer<typeof GallerySortSchema>;

export const GALLERY_SORTS = [
  "freshest",
  "longest_waiting",
] as const satisfies readonly GallerySort[];

/**
 * Freshest first: what someone arriving with no stated preference means by
 * "show me the animals", and the only ordering that surfaces a listing a
 * shelter has just tended to.
 */
export const DEFAULT_GALLERY_SORT: GallerySort = "freshest";
