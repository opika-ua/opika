import type {
  DonationLink,
  ExactAddress,
  PendingDonation,
  PublicLocation,
  ShelterContact,
  ShelterId,
  ShelterLegalEntity,
  ShelterLogo,
  ShelterVerification,
  VerificationStatus,
} from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { authOrganization } from "./auth";
import { cities } from "./cities";
import { jsonb } from "./helpers";

export const shelters = pgTable(
  "shelters",
  {
    id: text().primaryKey().$type<ShelterId>(),
    displayName: text("display_name").notNull(),
    /** Null when the shelter has written no description; English only ever with Ukrainian (CHECK below). */
    descriptionUk: text("description_uk"),
    descriptionEnText: text("description_en_text"),
    descriptionEnProvenance: text("description_en_provenance", {
      enum: ["human", "machine"],
    }),
    /** Null until the operator adds it (minimal create); a verified shelter always has it. */
    legalEntity: jsonb<ShelterLegalEntity>("legal_entity"),
    publicLocation: jsonb<PublicLocation>("public_location").notNull(),
    /** Null until the operator adds it; the city is then only `city_id` / `public_location`. */
    exactAddress: jsonb<ExactAddress>("exact_address"),
    contact: jsonb<ShelterContact>("contact").notNull(),
    donation: jsonb<DonationLink>("donation"),
    logo: jsonb<ShelterLogo>("logo"),
    /**
     * A shelter's proposed replacement for `donation`, awaiting the operator
     * (H2, KABINET N20). Null when nothing is pending. The live `donation`
     * column is what adopters see until approval copies this across.
     */
    pendingDonation: jsonb<PendingDonation>("pending_donation"),

    freshnessSentenceUk: text("freshness_sentence_uk"),
    freshnessSentenceEn: text("freshness_sentence_en"),

    /** Denormalised from the verification JSONB for feed-query filtering. */
    verificationStatus: text("verification_status", {
      enum: ["pending", "under_review", "verified", "rejected", "paused", "suspended"],
    })
      .notNull()
      .$type<VerificationStatus>(),
    verification: jsonb<ShelterVerification>("verification").notNull(),
    /**
     * Operator permission to list before verification; expiry is read time, never written here.
     * Kept by moves inside pending/under_review (`keepsEarlyListing`), cleared by revoke and by
     * every other status change.
     */
    earlyListingSince: timestamp("early_listing_since", { withTimezone: true }),

    /** Set by hand when an admin asks to stop the weekly freshness reminder; null means it is sent. */
    freshnessReminderOffAt: timestamp("freshness_reminder_off_at", { withTimezone: true }),

    cityId: text("city_id")
      .notNull()
      .references(() => cities.id),
    /** The premises point, write-only; null when the address (or just its point) is not known. */
    exactLat: text("exact_lat"),
    exactLng: text("exact_lng"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at", {
      withTimezone: true,
    }).notNull(),
    /** Compare-and-set guard for audited writes (H2 S3, `Shelter.version`). */
    version: integer("version").notNull().default(0),
    /**
     * The Better Auth organization whose members administer this shelter.
     * Null until the shelter's first admin is invited (the registry PR).
     * Unique: one organization is one shelter, so a membership resolves to
     * exactly one `shelterId`.
     */
    organizationId: text("organization_id")
      .unique()
      .references(() => authOrganization.id),
  },
  (t) => [
    index("shelters_city_id_idx").on(t.cityId),
    index("shelters_verification_status_idx").on(t.verificationStatus),
    check(
      "shelters_exact_point_all_or_none",
      sql`(${t.exactLat} IS NULL) = (${t.exactLng} IS NULL)`,
    ),
    check(
      "shelters_exact_point_needs_address",
      sql`${t.exactLat} IS NULL OR ${t.exactAddress} IS NOT NULL`,
    ),
    check(
      "shelters_description_en_check",
      sql`${t.descriptionUk} IS NOT NULL OR (${t.descriptionEnText} IS NULL AND ${t.descriptionEnProvenance} IS NULL)`,
    ),
    /** The approve gate, held by the database too: verified, paused and suspended all come from approval. */
    check(
      "shelters_verified_has_verified_data",
      sql`${t.verificationStatus} IN ('pending', 'under_review', 'rejected') OR (${t.legalEntity} IS NOT NULL AND ${t.exactAddress} IS NOT NULL)`,
    ),
  ],
);
