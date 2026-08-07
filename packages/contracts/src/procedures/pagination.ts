import { MAX_GALLERY_NAVIGABLE_ROWS } from "@opika/domain";
import { z } from "zod";

/**
 * Opaque to the client on purpose.
 *
 * The cursor encodes a keyset position — the ordering tuple the feed query
 * seeks on. Publishing that shape in the contract would let clients construct
 * cursors, and would pin the persistence layer's ordering decision forever.
 * Branding it keeps a cursor from one list being passed to another.
 */
const OPAQUE_CURSOR_MAX_LENGTH = 512;

/**
 * The brand is a convenience for honest TypeScript callers and nothing more —
 * over the wire any string arrives, so a feed cursor and a reveal cursor are
 * indistinguishable until the server checks. The payload therefore has to carry
 * its own kind tag and be signed; the type system cannot do this job at a trust
 * boundary.
 *
 * Bounded because an unbounded cursor is parsed, logged and traced on every
 * request.
 */
export const FeedCursorSchema = z
  .string()
  .min(1)
  .max(OPAQUE_CURSOR_MAX_LENGTH)
  .brand<"FeedCursor">();
export type FeedCursor = z.infer<typeof FeedCursorSchema>;

export const RevealCursorSchema = z
  .string()
  .min(1)
  .max(OPAQUE_CURSOR_MAX_LENGTH)
  .brand<"RevealCursor">();
export type RevealCursor = z.infer<typeof RevealCursorSchema>;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const pageSizeSchema = z.int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE);

/**
 * The gallery's default page differs from the cursor-paginated default because
 * it fills a grid rather than a deck: 24 divides evenly by every column count
 * the responsive breakpoints use (1, 2, 3, 4), so the last row is never a
 * ragged one at any width. The ceiling is shared — nothing about the gallery
 * justifies a larger single response than any other list.
 */
export const GALLERY_PAGE_SIZE = 24;

export const galleryPageSizeSchema = z.int().min(1).max(MAX_PAGE_SIZE).default(GALLERY_PAGE_SIZE);

/**
 * A page number, not a cursor — the gallery's numbered, shareable, crawlable
 * pages are the named exception to this codebase's keyset rule
 * (`docs/standing-constraints.md`).
 *
 * The upper bound is one page per navigable row, which is the most pages that
 * can exist at the smallest permitted page size. Anything above it is a page
 * number no surface has ever generated, so it is rejected rather than clamped;
 * anything at or below it that has simply gone stale is served as the last real
 * page, which is a handler obligation rather than a schema one — see
 * `clampGalleryPage`.
 */
export const MAX_GALLERY_PAGE = MAX_GALLERY_NAVIGABLE_ROWS;

export const galleryPageSchema = z.int().min(1).max(MAX_GALLERY_PAGE).default(1);
