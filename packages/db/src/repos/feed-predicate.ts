import {
  ageAnchorRange,
  DISCOVERABLE_LISTING_KINDS,
  FEED_VISIBLE_VERIFICATION_STATUSES,
  type FeedFilters,
} from "@opika/domain";
import { and, inArray, or, type SQL, sql } from "drizzle-orm";
import { animals } from "../schema/animals";
import { shelters } from "../schema/shelters";

/**
 * The WHERE clause every animal-browsing query shares.
 *
 * Two repositories now build it — the deck's keyset feed and the gallery's
 * numbered pages — and they must agree exactly, or a filter that hides an
 * animal from one surface leaves it visible on the other. A sixth
 * `FeedFilters` dimension is a one-site edit here rather than a two-site edit
 * somebody does once.
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
 * Discoverable listing, verified shelter — true for every animal any adopter
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
 * The full predicate: what is showable, and what was asked for.
 *
 * Callers add their own pagination and personalisation on top — the deck adds
 * a keyset cursor and its seen-set exclusion, the gallery adds neither.
 */
export function buildFeedPredicate(filters: FeedFilters, now: Date): SQL[] {
  return [...buildDiscoverabilityPredicate(), ...buildFilterPredicate(filters, now)];
}
