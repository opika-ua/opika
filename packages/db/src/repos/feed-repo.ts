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
     * Whether this adopter currently has at least one swipe that still
     * excludes an animal under the given policy — filter-independent, not
     * scoped to any particular `FeedFilters`. An adopter who has only ever
     * swiped on dogs gets `true` here even against a cats-only feed, where
     * nothing was actually excluded — deliberately conservative in the
     * direction that matters, since this only ever suppresses a denominator
     * that *might* now be wrong (`DeckScreen.tsx`'s "N з M" counter and
     * progress bar are computed from the gallery's unfiltered total, which
     * has no seen-set exclusion of its own), never asserts one is right.
     * Oleksii's own resolution to R1's STOP (`docs/build-plan.md`, Phase R,
     * 2026-09-09): suppress both, but only when this is true — a
     * first-time visitor with an empty seen-set keeps the accurate count
     * the design doc specifies.
     *
     * A separate query, not a re-use of `buildSeenExclusion`'s NOT IN
     * clause: that clause is coupled to the outer query's `animals` alias
     * (`animals.id NOT IN (...)`), and answering "is there at least one"
     * doesn't need the `animals` table at all. Shares
     * `stillExcludesCondition` with it so the two can't drift apart on what
     * "still excludes" means.
     *
     * `.select().limit(1)`, not a raw `db.execute(sql\`...EXISTS...\`)`: the
     * two adapters this repo runs against return genuinely different raw
     * result shapes from `.execute()` (a `RowList` array for postgres-js,
     * `{ rows: T[] }` for neon-http — `../client.ts`'s own comment on why
     * `Database`'s cast is safe rests specifically on nothing in this repo
     * layer calling `.execute()`). A typed `.select()` chain is what that
     * comment's safety claim actually covers — Drizzle normalises its
     * return shape identically across adapters.
     */
    async hasActiveSeenSet(
      adopterId: AdopterId,
      now: Date,
      policy: SeenSetPolicy,
    ): Promise<boolean> {
      const rows = await db
        .select({ id: swipes.animalId })
        .from(swipes)
        .where(stillExcludesCondition(adopterId, now, policy))
        .limit(1);
      return rows.length > 0;
    },
  };
}

/**
 * The WHERE condition matching swipe rows that still exclude their animal
 * under the given policy — "interested" swipes exclude permanently, "pass"
 * swipes expire after `reshowAfterDays`. Shared between `buildSeenExclusion`
 * below and `feedRepo(db).hasActiveSeenSet`, so the two can't drift apart
 * on what "still excludes" means.
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
