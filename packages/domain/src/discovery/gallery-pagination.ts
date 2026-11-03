import { MAX_GALLERY_NAVIGABLE_ROWS } from "../core";

/**
 * How deep a numbered, browsable list will go, and how a requested page number
 * is reconciled with the result set that actually exists.
 *
 * Pure, and here rather than in the query layer, because the same two answers
 * are needed by the repository (which page to actually fetch) and by whatever
 * renders the result (how many page links to draw). Two implementations of
 * `Math.ceil` disagreeing at a boundary is a real bug and an invisible one.
 */

// Defined in `../core` (with the reasoning) so the contracts' client constants can reach it without zod.
export { MAX_GALLERY_NAVIGABLE_ROWS };

/**
 * How many pages are navigable for a result set of `totalMatching`.
 *
 * `totalMatching` stays truthful past the bound - the count shown to the
 * adopter is the real one - and only navigation is capped, so the surface
 * never claims to have found fewer animals than it did.
 *
 * Zero matches is zero pages, not one: "there are no results" and "there is one
 * empty page" are different claims, and only the first is true.
 */
export const galleryPageCount = (totalMatching: number, pageSize: number): number =>
  Math.ceil(Math.min(totalMatching, MAX_GALLERY_NAVIGABLE_ROWS) / pageSize);

/**
 * The deepest page the bound permits at a given page size.
 *
 * `galleryPageCount` caps the number of page links drawn, but a page number
 * arrives from a URL rather than from those links - `?stor=` is user-editable
 * and crawler-visible - so a request can name a page past the bound while rows
 * still exist under it. Without this, the bound would be a number reported in
 * the response and nothing else: the query would happily serve depth 5,000 and
 * return a `page` greater than the `totalPages` it had just claimed.
 *
 * `Math.max(1, ...)` because a page size larger than the whole bound still has
 * a first page.
 */
export const maxNavigablePage = (pageSize: number): number =>
  Math.max(1, Math.ceil(MAX_GALLERY_NAVIGABLE_ROWS / pageSize));

/**
 * The page that will actually be served for a requested one.
 *
 * An out-of-range page is a shared link that went stale - animals were adopted
 * and the list got shorter - not a broken one, so it resolves to the last real
 * page rather than to an error or a silent bounce to the start. When nothing
 * matches at all there is no last page to fall back to, and the answer is the
 * first: the caller renders its no-match state from `totalMatching`, not from
 * the page number.
 */
export const clampGalleryPage = (requestedPage: number, totalPages: number): number =>
  totalPages === 0 ? 1 : Math.min(Math.max(requestedPage, 1), totalPages);
