import type {
  DonationLink,
  ExactAddress,
  PublicLocation,
  ShelterContact,
  ShelterId,
  ShelterLegalEntity,
  ShelterVerification,
  VerificationStatus,
} from "@opika/domain";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { cities } from "./cities.js";
import { jsonb } from "./helpers.js";

export const shelters = pgTable(
  "shelters",
  {
    id: text().primaryKey().$type<ShelterId>(),
    displayName: text("display_name").notNull(),
    descriptionUk: text("description_uk").notNull(),
    descriptionEnText: text("description_en_text"),
    descriptionEnProvenance: text("description_en_provenance", {
      enum: ["human", "machine"],
    }),
    legalEntity: jsonb<ShelterLegalEntity>("legal_entity").notNull(),
    publicLocation: jsonb<PublicLocation>("public_location").notNull(),
    exactAddress: jsonb<ExactAddress>("exact_address").notNull(),
    contact: jsonb<ShelterContact>("contact").notNull(),
    donation: jsonb<DonationLink>("donation"),

    /** Denormalised from the verification JSONB for feed-query filtering. */
    verificationStatus: text("verification_status", {
      enum: ["pending", "under_review", "verified", "rejected", "paused", "suspended"],
    })
      .notNull()
      .$type<VerificationStatus>(),
    verification: jsonb<ShelterVerification>("verification").notNull(),

    cityId: text("city_id")
      .notNull()
      .references(() => cities.id),
    exactLat: text("exact_lat").notNull(),
    exactLng: text("exact_lng").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at", {
      withTimezone: true,
    }).notNull(),
  },
  (t) => [
    index("shelters_city_id_idx").on(t.cityId),
    index("shelters_verification_status_idx").on(t.verificationStatus),
  ],
);
