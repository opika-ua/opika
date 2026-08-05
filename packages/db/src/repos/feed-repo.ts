import {
  type AdopterId,
  type Animal,
  ageAnchorRange,
  DISCOVERABLE_LISTING_KINDS,
  FEED_VISIBLE_VERIFICATION_STATUSES,
  type FeedFilters,
  type SeenSetPolicy,
} from "@opika/domain";
import { and, desc, inArray, or, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client.js";
import { animals } from "../schema/animals.js";
import { shelters } from "../schema/shelters.js";
import { swipes } from "../schema/swipes.js";
import { rowToAnimal } from "./mappers.js";

export type FeedCursorData = {
  lastUpdatedAt: Date;
  id: string;
};

export type FeedPage = {
  items: readonly Animal[];
  nextCursor: FeedCursorData | null;
};

export function feedRepo(db: Database) {
  return {
    /**
     * Keyset-paginated feed query.
     *
     * Ordering: `(last_updated_at DESC, id ASC)` — newest first, ties broken
     * by id for determinism.
     *
     * The seen-set exclusion uses a NOT IN subquery on the swipes table,
     * respecting the seen-set policy (direction-based expiry, cap).
     */
    async list(opts: {
      filters: FeedFilters;
      cursor: FeedCursorData | null;
      limit: number;
      adopterId: AdopterId | null;
      now: Date;
      seenSetPolicy: SeenSetPolicy;
    }): Promise<FeedPage> {
      const conditions: SQL[] = [];

      // Only discoverable listings from verified shelters
      conditions.push(inArray(animals.listingKind, [...DISCOVERABLE_LISTING_KINDS]));

      // Only shelters in a feed-visible verification state.
      // Uses the domain constant so adding a state to
      // FEED_VISIBLE_VERIFICATION_STATUSES updates the query automatically,
      // mirroring how DISCOVERABLE_LISTING_KINDS is used above.
      conditions.push(
        sql`${animals.shelterId} IN (
          SELECT ${shelters.id} FROM ${shelters}
          WHERE ${inArray(shelters.verificationStatus, [...FEED_VISIBLE_VERIFICATION_STATUSES])}
        )`,
      );

      // Apply filters
      if (opts.filters.cities.kind === "oneOf") {
        conditions.push(inArray(animals.cityId, [...opts.filters.cities.values]));
      }
      if (opts.filters.species.kind === "oneOf") {
        conditions.push(inArray(animals.species, [...opts.filters.species.values]));
      }
      if (opts.filters.sizes.kind === "oneOf") {
        conditions.push(inArray(animals.size, [...opts.filters.sizes.values]));
      }
      if (opts.filters.ages.kind === "oneOf") {
        const ageConditions: SQL[] = opts.filters.ages.values.map((bucket) => {
          const range = ageAnchorRange(bucket, opts.now);
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
          ageConditions.length === 1
            ? (ageConditions[0] ?? sql`TRUE`)
            : sql`(${or(...ageConditions)})`,
        );
      }

      // Keyset cursor: (last_updated_at DESC, id ASC)
      // "Give me rows that come after the cursor in this ordering"
      if (opts.cursor) {
        const cursorTs = opts.cursor.lastUpdatedAt.toISOString();
        conditions.push(
          sql`(${animals.lastUpdatedAt} < ${cursorTs}::timestamptz
            OR (${animals.lastUpdatedAt} = ${cursorTs}::timestamptz
              AND ${animals.id} > ${opts.cursor.id}))`,
        );
      }

      // Seen-set exclusion via NOT IN on the swipes table
      if (opts.adopterId) {
        const seenSubquery = buildSeenExclusion(opts.adopterId, opts.now, opts.seenSetPolicy);
        if (seenSubquery) {
          conditions.push(seenSubquery);
        }
      }

      // Fetch limit+1 to detect if there's a next page
      const fetchLimit = opts.limit + 1;

      const rows = await db
        .select()
        .from(animals)
        .where(and(...conditions))
        .orderBy(desc(animals.lastUpdatedAt), animals.id)
        .limit(fetchLimit);

      const hasMore = rows.length > opts.limit;
      const pageRows = hasMore ? rows.slice(0, opts.limit) : rows;
      const items = pageRows.map(rowToAnimal);

      let nextCursor: FeedCursorData | null = null;
      const last = hasMore ? pageRows[pageRows.length - 1] : undefined;
      if (last) {
        nextCursor = {
          lastUpdatedAt: last.lastUpdatedAt,
          id: last.id,
        };
      }

      return { items, nextCursor };
    },
  };
}

/**
 * Builds a NOT IN clause for seen-set exclusion.
 *
 * Rather than materializing all swipes into a JS array, this pushes the
 * policy logic into SQL. "interested" swipes always exclude; "pass" swipes
 * expire after `reshowAfterDays`.
 */
function buildSeenExclusion(adopterId: AdopterId, now: Date, policy: SeenSetPolicy): SQL | null {
  const parts: SQL[] = [];

  // "interested" swipes exclude permanently
  parts.push(sql`${swipes.adopterId} = ${adopterId} AND ${swipes.direction} = 'interested'`);

  // "pass" swipes exclude if within reshowAfterDays
  if (policy.reshowAfterDays !== null) {
    const cutoff = new Date(now.getTime() - policy.reshowAfterDays * 86_400_000).toISOString();
    parts.push(
      sql`${swipes.adopterId} = ${adopterId} AND ${swipes.direction} = 'pass' AND ${swipes.swipedAt} > ${cutoff}::timestamptz`,
    );
  } else {
    // null reshowAfterDays means pass swipes also exclude permanently
    parts.push(sql`${swipes.adopterId} = ${adopterId} AND ${swipes.direction} = 'pass'`);
  }

  return sql`${animals.id} NOT IN (
    SELECT ${swipes.animalId} FROM ${swipes}
    WHERE (${sql.join(parts, sql` OR `)})
    ORDER BY ${swipes.swipedAt} DESC
    LIMIT ${policy.maxTracked}
  )`;
}
