import type { AdopterId } from "@opika/domain";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { adopters } from "./adopters";

/**
 * Anonymous device sessions. The token itself never touches the database —
 * only its SHA-256 hash is stored. Lookup is by hash; comparison is
 * timing-safe in the application layer.
 *
 * Absolute expiry: reject if `created_at` is older than the max session age.
 * Idle expiry: reject if `last_seen_at` is older than the idle timeout.
 */
export const sessions = pgTable("sessions", {
  /** SHA-256 hex digest of the bearer token (64 chars). */
  tokenHash: text("token_hash").primaryKey(),
  adopterId: text("adopter_id")
    .notNull()
    .references(() => adopters.id)
    .$type<AdopterId>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
});
