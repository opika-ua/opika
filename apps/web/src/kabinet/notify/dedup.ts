import { createHash } from "node:crypto";

/**
 * A recipient inside a dedup key is a hash of the user id, never the id, so a key read off the
 * send log names nobody at a glance. It is pseudonymous, not anonymous: the hash is unsalted and
 * can be recomputed from an id that history still holds, so a row is linkable until the 90-day
 * purge (`docs/gdpr-analysis.md`). A keyed hash would need a secret: the owner's call. 64 bits is
 * far beyond what a handful of recipients per mail needs to stay collision-free.
 */
export const userHashOf = (userId: string): string =>
  createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 16);

export const dedupKeyOf = (dedupBase: string, userId: string): string =>
  `${dedupBase}:${userHashOf(userId)}`;
