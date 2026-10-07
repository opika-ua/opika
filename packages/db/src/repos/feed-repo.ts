import type { AdopterId, Animal, FeedFilters, SeenSetPolicy } from "@opika/domain";
import { and, desc, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import { swipes } from "../schema/swipes";
import { buildFeedPredicate } from "./feed-predicate";
import { rowToAnimal } from "./mappers";

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
     * `last_updated_at` mutates when a shelter edits a listing, which moves
     * the row's sort position. This means a cursor may skip a row that was
     * behind the cursor and moved ahead, or revisit one that moved back.
     * This is accepted: the seen-set exclusion absorbs duplicates, and a
     * skipped-then-edited listing will surface on the next fetch with its
     * new timestamp. Materialising a stable sort key would require a
     * recompute job, which is the trade-off the build plan explicitly
     * declined (see decision 10 in CLAUDE.md).
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
      // Discoverability and filters are shared with `galleryRepo.list`; only
      // the cursor and the seen-set below are the deck's own.
      const conditions: SQL[] = buildFeedPredicate(opts.filters, opts.now);

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
        conditions.push(buildSeenExclusion(opts.adopterId, opts.now, opts.seenSetPolicy));
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

    /**
     * How many animals the deck can still serve this adopter under these
     * filters, right now: the page query's own predicate and seen-set
     * exclusion, counted instead of paged (R5).
     *
     * Same `buildFeedPredicate` and the same `buildSeenExclusion` — including
     * its `LIMIT maxTracked` cap — so the count excludes exactly what
     * `list` excludes at this moment, not every swipe ever made. A separate
     * query rather than a window function on the page query, because the
     * page query has a keyset cursor and a LIMIT, and this must count the
     * whole remaining feed.
     *
     * A typed `.select()` with `count(*)` mapped to a number, not a raw
     * `db.execute()` — the same adapter-agnostic shape as `galleryRepo`'s
     * `countMatching`: postgres-js and neon-http return different raw result
     * shapes from `.execute()` and both return `count(*)`'s bigint as a
     * string, which `mapWith(Number)` normalises on either.
     *
     * The caller decides when this runs; see `handlers/feed.ts`.
     */
    async reachableCount(opts: {
      filters: FeedFilters;
      adopterId: AdopterId;
      now: Date;
      seenSetPolicy: SeenSetPolicy;
    }): Promise<number> {
      const conditions: SQL[] = [
        ...buildFeedPredicate(opts.filters, opts.now),
        buildSeenExclusion(opts.adopterId, opts.now, opts.seenSetPolicy),
      ];
      const rows = await db
        .select({ total: sql<number>`count(*)`.mapWith(Number) })
        .from(animals)
        .where(and(...conditions));
      return rows[0]?.total ?? 0;
    },
  };
}

/**
 * The WHERE condition matching swipe rows that still exclude their animal
 * under the given policy — "interested" swipes exclude permanently, "pass"
 * swipes expire after `reshowAfterDays`. Kept as its own function so what
 * "still excludes" means is defined once.
 */
function stillExcludesCondition(adopterId: AdopterId, now: Date, policy: SeenSetPolicy): SQL {
  const parts: SQL[] = [
    sql`${swipes.adopterId} = ${adopterId} AND ${swipes.direction} = 'interested'`,
  ];

  if (policy.reshowAfterDays !== null) {
    const cutoff = new Date(now.getTime() - policy.reshowAfterDays * 86_400_000).toISOString();
    parts.push(
      sql`${swipes.adopterId} = ${adopterId} AND ${swipes.direction} = 'pass' AND ${swipes.swipedAt} > ${cutoff}::timestamptz`,
    );
  } else {
    // null reshowAfterDays means pass swipes also exclude permanently
    parts.push(sql`${swipes.adopterId} = ${adopterId} AND ${swipes.direction} = 'pass'`);
  }

  return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * Builds a NOT IN clause for seen-set exclusion.
 *
 * Rather than materializing all swipes into a JS array, this pushes the
 * policy logic into SQL.
 */
function buildSeenExclusion(adopterId: AdopterId, now: Date, policy: SeenSetPolicy): SQL {
  return sql`${animals.id} NOT IN (
    SELECT ${swipes.animalId} FROM ${swipes}
    WHERE ${stillExcludesCondition(adopterId, now, policy)}
    ORDER BY ${swipes.swipedAt} DESC
    LIMIT ${policy.maxTracked}
  )`;
}
