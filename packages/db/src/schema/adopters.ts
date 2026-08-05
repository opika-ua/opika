import type { AdopterId, CountryCode, FeedFilters, Locale } from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "./helpers.js";

export const adopters = pgTable(
  "adopters",
  {
    id: text().primaryKey().$type<AdopterId>(),
    identityKind: text("identity_kind", {
      enum: ["anonymous", "account"],
    }).notNull(),
    /** Non-null when identityKind = 'anonymous'. Server-issued, ≥32 chars. */
    deviceSessionId: text("device_session_id").unique(),
    /** Non-null when identityKind = 'account'. */
    accountId: text("account_id").unique(),
    /** Non-null when identityKind = 'account'. */
    email: text(),
    country: text().notNull().$type<CountryCode>(),
    preferredLocale: text("preferred_locale", {
      enum: ["uk", "en"],
    })
      .notNull()
      .$type<Locale>(),
    savedFilters: jsonb<FeedFilters>("saved_filters"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "adopters_identity_check",
      sql`(${t.identityKind} = 'anonymous' AND ${t.deviceSessionId} IS NOT NULL AND ${t.accountId} IS NULL)
       OR (${t.identityKind} = 'account' AND ${t.accountId} IS NOT NULL AND ${t.email} IS NOT NULL AND ${t.deviceSessionId} IS NULL)`,
    ),
  ],
);
