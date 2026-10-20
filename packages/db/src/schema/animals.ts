import type {
  AgeEstimate,
  AnimalId,
  AnimalListingState,
  AnimalPhoto,
  AnimalSex,
  AnimalSpecies,
  CityId,
  CoatLength,
  DocumentReadiness,
  LocalizedText,
  PublicLocation,
  ShelterId,
  SizeBucket,
  SpayNeuterStatus,
  VaccinationStatus,
} from "@opika/domain";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { cities } from "./cities";
import { jsonb } from "./helpers";
import { shelters } from "./shelters";

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
    /**
     * Size, age and the Ukrainian description are nullable for a draft only
     * (F-B1, K-Q5: "name + species to create; everything else and ≥1 photo
     * to publish"). `animals_listing_facts_check` below refuses a null in any
     * of them on every other listing kind, so the database refuses what the
     * domain union refuses.
     */
    size: text({ enum: ["small", "medium", "large"] }).$type<SizeBucket>(),
    /**
     * Null is «Не записано» on every listing kind, not only a draft (DR1-D10):
     * fur is no listing fact, so `animals_listing_facts_check` leaves it out.
     * Added with no default and no backfill (migration 0014), because a
     * value written for an animal nobody described would be an invented fact.
     * No index of its own: a two-value equality applied on rows the feed and
     * wait-anchor indexes already narrow.
     */
    coatLength: text("coat_length", { enum: ["short", "long"] }).$type<CoatLength>(),

    age: jsonb<AgeEstimate>("age"),
    /**
     * Derived from `ageAnchorOf(age)` at write time. The indexed column for
     * age-bucket filtering — one range predicate instead of a multi-branch OR
     * across two columns. See `packages/domain` age.ts for the derivation.
     * Null exactly when `age` is (`animals_age_anchor_check`).
     */
    ageAnchorAt: timestamp("age_anchor_at", { withTimezone: true }),

    /**
     * Derived from `waitAnchorOf(listing)` at write time — when the animal
     * became available, which is what a "longest waiting" ordering sorts on.
     *
     * Nullable, unlike `age_anchor_at`, because the derivation is: a draft,
     * adopted or withdrawn animal is not waiting for anyone. Both indexes
     * below are partial on the discoverable kinds, so those nulls are never
     * scanned rather than merely sorted last.
     *
     * Not `last_updated_at`, which is edit time — a shelter fixing a typo
     * would make a four-month wait read as freshly available.
     */
    waitAnchorAt: timestamp("wait_anchor_at", { withTimezone: true }),

    /**
     * Derived from `confirmationAnchorOf(listing)` at write time (H2): when
     * the shelter last confirmed the animal is still looking. What freshness
     * measures, and the ordering key of the deck's keyset and the gallery's
     * `freshest` sort (decision #10, revised 2026-10-07).
     *
     * Nullable for the same reason as `wait_anchor_at`: a draft, adopted or
     * withdrawn animal is confirmed as nothing. Both feed indexes below are
     * partial on, or led by, the discoverable kinds.
     *
     * Deliberately not `last_updated_at`, which is edit time: once shelters
     * can edit, a typo fix would otherwise make an old card read as fresh
     * and jump to the top of both orderings.
     */
    lastConfirmedAt: timestamp("last_confirmed_at", { withTimezone: true }),
    /**
     * When the listing was first made public, set once and **never cleared**
     * (HS-Q9, Oleksii). `restore_to_draft` drops the listing's own
     * `publishedAt`, so without this a draft that used to be public would look
     * never-published, and `deleteDraft` would erase a listing whose public
     * URL and adopter swipes and reveals still point at it. Null means it has
     * never been public, which is the only case a draft may be deleted.
     *
     * **A delete guard only** (HS-Q11, Oleksii). It never appears in any view
     * or API output, and nothing orders or filters on it. For rows that were
     * adopted or withdrawn when migration 0010 ran, it holds their adopted or
     * withdrawn date: "public no later than", **not** the real first
     * publication, which those rows no longer record. Reading it as a
     * publication date would be wrong for exactly those rows.
     */
    firstPublishedAt: timestamp("first_published_at", { withTimezone: true }),

    descriptionUk: text("description_uk"),
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
     * Non-null when the animal is fostered away from its shelter. Contains
     * city + district + fuzzed coordinates derived from the foster city's
     * centroid (never from a foster carer's address). When null, the animal
     * is at the shelter and inherits the shelter's public location.
     */
    publicLocation: jsonb<PublicLocation>("public_location"),

    /**
     * The city the animal is discoverable in. For animals at the shelter,
     * this equals the shelter's city. For fostered animals, it is the
     * foster city — legitimately independent of the shelter's city,
     * supporting Ukrainian foster networks where animals move across cities.
     */
    cityId: text("city_id")
      .notNull()
      .references(() => cities.id)
      .$type<CityId>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at", {
      withTimezone: true,
    }).notNull(),
    /** Compare-and-set guard for edits (S3-T6, `Animal.version`). Listing moves don't bump it. */
    version: integer("version").notNull().default(0),
  },
  (t) => [
    index("animals_shelter_id_idx").on(t.shelterId),

    /**
     * A listing that was ever published keeps its size, age and description
     * (F-B1): only a draft may lack one. The same pattern as
     * `adopters_identity_check`: the database refuses the row the type
     * refuses, so a write path that forgot `publishReadinessOf` fails here
     * with 23514 instead of publishing an incomplete card.
     */
    check(
      "animals_listing_facts_check",
      sql`${t.listingKind} = 'draft' OR (${t.size} IS NOT NULL AND ${t.age} IS NOT NULL AND ${t.descriptionUk} IS NOT NULL)`,
    ),
    /** The anchor is derived from the age, so one is null exactly when the other is. */
    check("animals_age_anchor_check", sql`(${t.age} IS NULL) = (${t.ageAnchorAt} IS NULL)`),
    /** English is never stored without the Ukrainian it translates (`LocalizedText`'s rule). */
    check(
      "animals_description_en_check",
      sql`${t.descriptionUk} IS NOT NULL OR (${t.descriptionEnText} IS NULL AND ${t.descriptionEnProvenance} IS NULL)`,
    ),

    /**
     * The feed index. Equality columns first (the ones feed filters match on),
     * then the keyset ordering tuple `(last_confirmed_at DESC, id)`.
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
    index("animals_feed_idx").on(
      t.listingKind,
      t.cityId,
      t.species,
      t.size,
      t.lastConfirmedAt,
      t.id,
    ),

    /**
     * Partial index for the unfiltered feed — the most common case.
     * Covers `WHERE listing_kind IN ('published','reserved') ORDER BY last_confirmed_at DESC, id`.
     * The composite feed_idx above can't provide ordering when city/species/size aren't filtered
     * because Postgres can't skip middle columns.
     */
    index("animals_feed_unfiltered_idx")
      .on(t.lastConfirmedAt.desc().nullsFirst(), t.id.asc())
      .where(sql`listing_kind IN ('published', 'reserved')`),

    /**
     * The mirror of `animals_feed_unfiltered_idx` for the longest-waiting
     * ordering: unfiltered, ascending (oldest anchor first), partial on the
     * discoverable kinds so the nulls this column carries for drafts and
     * adopted animals never enter it.
     */
    index("animals_wait_anchor_idx")
      .on(t.waitAnchorAt.asc().nullsLast(), t.id.asc())
      .where(sql`listing_kind IN ('published', 'reserved')`),

    /**
     * The mirror of `animals_feed_idx`: equality columns first, then the
     * ordering tuple, for a longest-waiting query that also filters.
     *
     * `listing_kind` deliberately does *not* lead here, unlike in
     * `animals_feed_idx`. The partial predicate already restricts the index to
     * the two discoverable kinds, so repeating it as a leading column would
     * only put a two-element `IN` in front of `city_id` — and a btree scan
     * whose leading column is matched by `= ANY(...)` rather than a single
     * value returns rows grouped per array element, not in index order, which
     * makes the planner add the `Sort` node this index exists to remove.
     * `packages/db/test/wait-anchor-explain.test.ts` asserts the absence of
     * that node for both filtered and unfiltered wait-anchor queries.
     */
    index("animals_wait_anchor_filtered_idx")
      .on(t.cityId, t.species, t.size, t.waitAnchorAt.asc().nullsLast(), t.id.asc())
      .where(sql`listing_kind IN ('published', 'reserved')`),
  ],
);

/** Re-export for foreign-key references from other tables. */
export type { LocalizedText };
