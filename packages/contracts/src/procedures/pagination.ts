import { z } from "zod";

/**
 * Opaque to the client on purpose.
 *
 * The cursor encodes a keyset position — the ordering tuple the feed query
 * seeks on. Publishing that shape in the contract would let clients construct
 * cursors, and would pin the persistence layer's ordering decision forever.
 * Branding it keeps a cursor from one list being passed to another.
 */
export const FeedCursorSchema = z.string().min(1).brand<"FeedCursor">();
export type FeedCursor = z.infer<typeof FeedCursorSchema>;

export const RevealCursorSchema = z.string().min(1).brand<"RevealCursor">();
export type RevealCursor = z.infer<typeof RevealCursorSchema>;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const pageSizeSchema = z.int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE);
