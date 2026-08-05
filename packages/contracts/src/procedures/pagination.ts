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
