import {
  ageAnchorRange,
  DISCOVERABLE_LISTING_KINDS,
  FEED_VISIBLE_VERIFICATION_STATUSES,
  type FeedFilters,
  type GalleryScope,
} from "@opika/domain";
import { and, eq, inArray, or, type SQL, sql } from "drizzle-orm";
import { animals } from "../schema/animals";
import { shelters } from "../schema/shelters";

/**
 * The WHERE clause every animal-browsing query shares.
 *
 * Two repositories now build it - the deck's keyset feed and the gallery's
 * numbered pages - and they must agree exactly, or a filter that hides an
 * animal from one surface leaves it visible on the other. A new
 * `FeedFilters` dimension (temperament and colour were the sixth and seventh)
 * is a one-site edit here rather than a two-site edit somebody does once.
 *
 * Split into the two halves rather than only the whole, because
 * `gallery.relaxationCounts` needs them separately: its base scan is the
 * discoverability half, and each `COUNT(*) FILTER (...)` column is the filter
 * half over a filter set with one dimension relaxed. Building the whole
 * predicate into every FILTER clause would repeat the shelter subquery once per
 * column.
 *
 * Deliberately not re-exported from `repos/index.ts`, which is what feature
 * code imports as `@opika/db/repos`. These return Drizzle `SQL`, and the
 * repository boundary exists so a query builder never reaches a route handler;
 * putting them on the barrel would make that reach the path of least
 * resistance for the next caller who wants "just one more condition".
 *
 * The condition order is load-bearing only in that
 * `test/feed-predicate-identity.test.ts` pins the SQL `feed.list` generates;
 * Postgres does not care, but a silent reordering would hide a genuine change
 * in the same diff.
 */

/**
 * Discoverable listing, verified shelter - true for every animal any adopter
 * surface may show, independent of what they filtered on.
 */
export function buildDiscoverabilityPredicate(): SQL[] {
  return [
    inArray(animals.listingKind, [...DISCOVERABLE_LISTING_KINDS]),

    // The domain constants are used rather than literal SQL so adding a state
    // to either list updates the query automatically; `DISCOVERABLE_LISTING_KINDS`
    // carries a `satisfies` for exactly this reason.
    sql`${animals.shelterId} IN (
          SELECT ${shelters.id} FROM ${shelters}
          WHERE ${inArray(shelters.verificationStatus, [...FEED_VISIBLE_VERIFICATION_STATUSES])}
        )`,
  ];
}

/**
 * Only what the adopter asked for. Empty when nothing is constrained, which is
 * why `{ kind: "any" }` exists as a distinct variant rather than an empty list.
 *
 * `now` is a parameter because the age predicate is a *range over an anchor*
 * rather than a stored bucket: which anchors count as `baby` depends on when
 * the question is asked.
 */
export function buildFilterPredicate(filters: FeedFilters, now: Date): SQL[] {
  const conditions: SQL[] = [];

  if (filters.cities.kind === "oneOf") {
    conditions.push(inArray(animals.cityId, [...filters.cities.values]));
  }
  if (filters.species.kind === "oneOf") {
    conditions.push(inArray(animals.species, [...filters.species.values]));
  }
  if (filters.sizes.kind === "oneOf") {
    conditions.push(inArray(animals.size, [...filters.sizes.values]));
  }
  // `IN` never matches NULL, so an animal whose fur isn't recorded is left
  // out while a fur filter is on (DR1-D11), the way every other dimension
  // treats a value it can't confirm; the relaxation count says how many.
  if (filters.coatLengths.kind === "oneOf") {
    conditions.push(inArray(animals.coatLength, [...filters.coatLengths.values]));
  }
  // "Has any of the chosen traits": array overlap, which the GIN index
  // `animals_temperament_traits_idx` answers. The right-hand array is built in
  // SQL from one scalar parameter per trait, never bound as one JS array:
  // postgres-js (local) and neon-http (production) aren't proven to bind an
  // array parameter identically (`r2-cleanup-repo.ts` records the same
  // choice), and a scalar text parameter is the one thing both bind alike.
  // An animal with no presets recorded (`{}`) overlaps nothing, so it is left
  // out, as unrecorded fur is.
  if (filters.temperaments.kind === "oneOf") {
    const traits = sql.join(
      filters.temperaments.values.map((trait) => sql`${trait}`),
      sql`, `,
    );
    conditions.push(sql`${animals.temperamentTraits} && ARRAY[${traits}]::text[]`);
  }
  // A plain `IN` on the btree-indexed `coat_colour`. A custom colour stores
  // NULL there (its words are in `coat_colour_custom_uk`), so it never matches
  // a colour filter, and neither does an unrecorded one.
  if (filters.colours.kind === "oneOf") {
    conditions.push(inArray(animals.coatColour, [...filters.colours.values]));
  }
  if (filters.ages.kind === "oneOf") {
    const ageConditions: SQL[] = filters.ages.values.map((bucket) => {
      const range = ageAnchorRange(bucket, now);
      const parts: SQL[] = [];
      if (range.afterExclusive) {
        const after = range.afterExclusive.toISOString();
        parts.push(sql`${animals.ageAnchorAt} > ${after}::timestamptz`);
      }
      if (range.atOrBefore) {
        const atOrBefore = range.atOrBefore.toISOString();
        parts.push(sql`${animals.ageAnchorAt} <= ${atOrBefore}::timestamptz`);
      }
      return parts.length > 1 ? sql`(${and(...parts)})` : (parts[0] ?? sql`TRUE`);
    });
    conditions.push(
      ageConditions.length === 1 ? (ageConditions[0] ?? sql`TRUE`) : sql`(${or(...ageConditions)})`,
    );
  }

  return conditions;
}

/**
 * Whose animals: nothing for everyone, one equality for a shelter's page.
 *
 * Always added *alongside* the discoverability half, never instead of it, so
 * a scope naming an unknown, unverified, suspended or paused shelter matches
 * nothing (the shelter subquery already excludes it) rather than listing its
 * animals. Kept out of `buildFeedPredicate` because the deck has no scope and
 * `feed-predicate-identity.test.ts` pins the SQL the deck generates.
 */
export function buildScopePredicate(scope: GalleryScope): SQL[] {
  switch (scope.kind) {
    case "everyone":
      return [];
    case "shelter":
      return [eq(animals.shelterId, scope.shelterId)];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = scope;
      return unreachable;
    }
  }
}

/**
 * The full predicate: what is showable, and what was asked for.
 *
 * Callers add their own pagination and personalisation on top - the deck adds
 * a keyset cursor and its seen-set exclusion, the gallery adds neither.
 */
export function buildFeedPredicate(filters: FeedFilters, now: Date): SQL[] {
  return [...buildDiscoverabilityPredicate(), ...buildFilterPredicate(filters, now)];
}
