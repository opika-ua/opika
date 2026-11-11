import { createHash } from "node:crypto";

/**
 * A recipient inside a dedup key is a hash of the user id, never the id: the key is the send
 * log's primary key and `ON DELETE SET NULL` does not touch it, so a raw id would outlive an
 * erased account for up to 90 days. 64 bits is far beyond what a handful of recipients per mail
 * needs to stay collision-free, and once the account is gone nothing is left to hash back to.
 */
export const userHashOf = (userId: string): string =>
  createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 16);

export const dedupKeyOf = (dedupBase: string, userId: string): string =>
  `${dedupBase}:${userHashOf(userId)}`;
