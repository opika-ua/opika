import type {
  AgeEstimate,
  AnimalId,
  AnimalListingState,
  AnimalPhoto,
  AnimalSex,
  AnimalSpecies,
  CityId,
  DocumentReadiness,
  LocalizedText,
  ShelterId,
  SizeBucket,
  SpayNeuterStatus,
  VaccinationStatus,
} from "@opika/domain";
import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { cities } from "./cities.js";
import { jsonb } from "./helpers.js";
import { shelters } from "./shelters.js";

export const animals = pgTable(
  "animals",
  {
    id: text().primaryKey().$type<AnimalId>(),
    shelterId: text("shelter_id")
      .notNull()
      .references(() => shelters.id)
      .$type<ShelterId>(),
    name: text().notNull(),
    species: text({ enum: ["dog", "cat"] })
      .notNull()
      .$type<AnimalSpecies>(),
    sex: text({ enum: ["male", "female", "unknown"] })
      .notNull()
      .$type<AnimalSex>(),
    size: text({ enum: ["small", "medium", "large"] })
      .notNull()
      .$type<SizeBucket>(),

    age: jsonb<AgeEstimate>("age").notNull(),
    /**
     * Derived from `ageAnchorOf(age)` at write time. The indexed column for
     * age-bucket filtering — one range predicate instead of a multi-branch OR
     * across two columns. See `packages/domain` age.ts for the derivation.
     */
    ageAnchorAt: timestamp("age_anchor_at", { withTimezone: true }).notNull(),

    descriptionUk: text("description_uk").notNull(),
    descriptionEnText: text("description_en_text"),
    descriptionEnProvenance: text("description_en_provenance", {
      enum: ["human", "machine"],
    }),

    photos: jsonb<readonly AnimalPhoto[]>("photos").notNull(),
    vaccination: jsonb<VaccinationStatus>("vaccination").notNull(),
    spayNeuter: jsonb<SpayNeuterStatus>("spay_neuter").notNull(),
    documentReadiness: jsonb<DocumentReadiness>("document_readiness").notNull(),

    listing: jsonb<AnimalListingState>("listing").notNull(),
    /** Denormalised from listing JSONB for feed-query filtering. */
    listingKind: text("listing_kind", {
      enum: ["draft", "published", "reserved", "adopted", "withdrawn"],
    })
      .notNull()
      .$type<AnimalListingState["kind"]>(),

    /**
     * Denormalised from the shelter for feed-query filtering. The build plan
     * explicitly requires this: "Denormalise city_id onto animals as a
     * persistence projection, and put equality columns before the ordering
     * tuple in the feed index."
     */
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id)
      .$type<CityId>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at", {
      withTimezone: true,
    }).notNull(),
  },
  (t) => [
    index("animals_shelter_id_idx").on(t.shelterId),

    /**
     * The feed index. Equality columns first (the ones feed filters match on),
     * then the keyset ordering tuple `(last_updated_at DESC, id)`.
     *
     * Postgres can skip leading equality columns it doesn't need for a given
     * query, but it cannot skip columns in the middle. Listing kind and
     * verification status are always present in the feed predicate
     * (`DISCOVERABLE_LISTING_KINDS`), so they lead.
     *
     * `city_id` and `species` are the most selective optional filters and sit
     * next. `size` follows. Age filtering uses `age_anchor_at` as a range
     * predicate and must be handled outside this index (it would break the
     * ordering guarantee if placed before the keyset columns).
     */
    index("animals_feed_idx").on(t.listingKind, t.cityId, t.species, t.size, t.lastUpdatedAt, t.id),

    /**
     * Partial index for the unfiltered feed — the most common case.
     * Covers `WHERE listing_kind IN ('published','reserved') ORDER BY last_updated_at DESC, id`.
     * The composite feed_idx above can't provide ordering when city/species/size aren't filtered
     * because Postgres can't skip middle columns.
     */
    index("animals_feed_unfiltered_idx")
      .on(t.lastUpdatedAt.desc().nullsFirst(), t.id.asc())
      .where(sql`listing_kind IN ('published', 'reserved')`),
  ],
);

/** Re-export for foreign-key references from other tables. */
export type { LocalizedText };
