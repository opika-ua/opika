/**
 * Plain constants a client file may import without pulling zod and the contract: the only runtime
 * import allowed here is `@opika/domain/core`. The schemas in `procedures/` derive from these, and
 * the index re-exports this file, so server imports are unchanged. A guard test in `apps/web`
 * pins both rules.
 */
import { MAX_GALLERY_NAVIGABLE_ROWS } from "@opika/domain/core";

/** City tokens a request may name, and how long each may be (the URL reader caps to the same). */
export const MAX_CITY_TOKENS = 30;
export const MAX_CITY_TOKEN_LENGTH = 100;

/**
 * A page number, not a cursor - the gallery's numbered, shareable, crawlable pages are the named
 * exception to this codebase's keyset rule (`docs/standing-constraints.md`).
 *
 * The upper bound is one page per navigable row, which is the most pages that can exist at the
 * smallest permitted page size. Anything above it is a page number no surface has ever generated,
 * so it is rejected rather than clamped; anything at or below it that has simply gone stale is
 * served as the last real page, which is a handler obligation rather than a schema one - see
 * `clampGalleryPage`.
 */
export const MAX_GALLERY_PAGE = MAX_GALLERY_NAVIGABLE_ROWS;
