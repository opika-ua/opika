import {
  type Animal,
  clampGalleryPage,
  FEED_FILTER_DIMENSIONS,
  type FeedFilterDimension,
  type FeedFilters,
  type GallerySort,
  galleryPageCount,
  isConstrained,
  maxNavigablePage,
  relaxDimension,
} from "@opika/domain";
import { and, asc, desc, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import {
  buildDiscoverabilityPredicate,
  buildFeedPredicate,
  buildFilterPredicate,
} from "./feed-predicate";
import { rowToAnimal } from "./mappers";

export type GalleryPage = {
  readonly items: readonly Animal[];
  /** Every match, not just this page, and uncapped — the count is honest even
   * where navigation is not. */
  readonly totalMatching: number;
  readonly totalShelters: number;
  readonly totalPages: number;
  /** The page actually served, which differs from the requested one when that
   * page no longer exists, or when it lies past the navigable bound. Never
   * greater than `totalPages` unless nothing matches at all. */
  readonly page: number;
};

/** Per-dimension counts for "how many more would you see without this filter". */
export type GalleryRelaxationCounts = {
  readonly current: number;
  readonly relaxations: readonly {
    readonly dimension: FeedFilterDimension;
    readonly additional: number;
  }[];
};

/**
 * `ORDER BY` for each sort mode, as the ordering tuple the matching partial
 * index provides — `(last_updated_at DESC, id)` for `animals_feed_idx` /
 * `animals_feed_unfiltered_idx`, `(wait_anchor_at ASC, id)` for the two
 * wait-anchor indexes. Diverging from these is how a `Sort` node appears.
 */
function orderingFor(sort: GallerySort): SQL[] {
  switch (sort) {
    case "freshest":
      return [desc(animals.lastUpdatedAt), asc(animals.id)];
    case "longest_waiting":
      // NULLS LAST matches the index declaration. No discoverable row should
      // have a null anchor at all — the migration's own guard refuses to leave
      // one — but the index has to declare an ordering for nulls regardless,
      // and the query has to ask for the same one.
      return [sql`${animals.waitAnchorAt} ASC NULLS LAST`, asc(animals.id)];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = sort;
      return unreachable;
    }
  }
}

export function galleryRepo(db: Database) {
  return {
    /**
     * One numbered page, with the totals the page links are drawn from.
     *
     * `OFFSET`, not a keyset cursor — the named exception in
     * `docs/standing-constraints.md`. "What is on page 7" has no answer from a
     * cursor without walking pages 1-6 first, so this is a shape mismatch
     * rather than a discipline lapse, and it is bounded rather than open.
     *
     * `COUNT(*) OVER()` rides the same scan as the page fetch, so the page and
     * the total it is drawn from cannot disagree under a concurrent write, and
     * no second round-trip is spent on the common path.
     *
     * Deliberately no `scoreAnimal` re-ranking, unlike the deck. Score is a
     * function of freshness decay, so re-ranking would reorder the same rows as
     * time passed — and a numbered, shareable, crawlable page whose contents
     * shift between two requests is not reproducible, which is the whole
     * premise of this surface.
     */
    async list(opts: {
      filters: FeedFilters;
      sort: GallerySort;
      page: number;
      pageSize: number;
      now: Date;
    }): Promise<GalleryPage> {
      const conditions = buildFeedPredicate(opts.filters, opts.now);
      const where = and(...conditions);
      const ordering = orderingFor(opts.sort);

      const fetchPage = async (
        page: number,
      ): Promise<{
        rows: readonly (typeof animals.$inferSelect & { totalMatching: number })[];
      }> => {
        const rows = await db
          .select({
            ...getAnimalColumns(),
            totalMatching: sql<number>`count(*) OVER()`.mapWith(Number),
          })
          .from(animals)
          .where(where)
          .orderBy(...ordering)
          .limit(opts.pageSize)
          .offset((page - 1) * opts.pageSize);
        return { rows };
      };

      // Capped before the fetch, not after. `totalPages` alone would leave the
      // bound as a number in the response that nothing enforced: past it, rows
      // still exist, so the page query returns a full page and the response
      // claims a `page` greater than the `totalPages` it just reported. The
      // requested number comes from a user-editable, crawler-visible `?stor=`,
      // never only from the page links this bound governs.
      const requestedPage = Math.min(Math.max(opts.page, 1), maxNavigablePage(opts.pageSize));
      const first = await fetchPage(requestedPage);

      // The in-range path: the window function already carried the total, so
      // nothing more is needed.
      const firstTotal = first.rows[0]?.totalMatching;
      if (firstTotal !== undefined) {
        const totalPages = galleryPageCount(firstTotal, opts.pageSize);
        const [totalShelters] = await Promise.all([countShelters(db, where)]);
        return {
          items: first.rows.map(rowToAnimal),
          totalMatching: firstTotal,
          totalShelters,
          totalPages,
          page: requestedPage,
        };
      }

      // Zero rows, which is ambiguous: either nothing matches, or the page is
      // past the end and `COUNT(*) OVER()` had no row to attach the total to.
      // Only here does the second query cost anything.
      const [totalMatching, totalShelters] = await Promise.all([
        countMatching(db, where),
        countShelters(db, where),
      ]);
      const totalPages = galleryPageCount(totalMatching, opts.pageSize);
      const page = clampGalleryPage(requestedPage, totalPages);

      if (totalPages === 0 || page === requestedPage) {
        // Genuinely no matches — or a page that is in range and simply empty,
        // which the predicate makes impossible but which costs nothing to
        // handle honestly rather than by re-running the same query.
        return { items: [], totalMatching, totalShelters, totalPages, page };
      }

      const clamped = await fetchPage(page);
      return {
        items: clamped.rows.map(rowToAnimal),
        totalMatching,
        totalShelters,
        totalPages,
        page,
      };
    },

    /**
     * How many more animals each currently-applied filter is hiding.
     *
     * One scan with a `COUNT(*) FILTER (...)` per constrained dimension — the
     * "one grouped query, not N round-trips" requirement met literally. Only
     * constrained dimensions get a column: there is no "remove the size filter"
     * suggestion to make when no size filter is applied, and leaving them out
     * keeps the query as small as the filter set rather than a fixed width.
     *
     * Each column reuses `buildFilterPredicate` over a filter set with one
     * dimension relaxed, so a relaxation count and the list it is offering to
     * expand can never be computed from different rules.
     */
    async relaxationCounts(opts: {
      filters: FeedFilters;
      now: Date;
    }): Promise<GalleryRelaxationCounts> {
      const base = and(...buildDiscoverabilityPredicate());
      const currentFilter = and(...buildFilterPredicate(opts.filters, opts.now)) ?? sql`TRUE`;

      const constrained = FEED_FILTER_DIMENSIONS.filter((dimension) =>
        isConstrained(opts.filters, dimension),
      );

      const columns: SQL[] = [sql`count(*) FILTER (WHERE ${currentFilter}) AS current`];
      for (const [index, dimension] of constrained.entries()) {
        const relaxed =
          and(...buildFilterPredicate(relaxDimension(opts.filters, dimension), opts.now)) ??
          sql`TRUE`;
        columns.push(sql`count(*) FILTER (WHERE ${relaxed}) AS ${sql.raw(`without_${index}`)}`);
      }

      const rows = await db.execute<Record<string, string | number>>(
        sql`SELECT ${sql.join(columns, sql`, `)} FROM ${animals} WHERE ${base}`,
      );
      const row = Array.from(rows as Iterable<Record<string, string | number>>)[0] ?? {};

      const current = Number(row["current"] ?? 0);
      const relaxations = constrained
        .map((dimension, index) => ({
          dimension,
          // The `+N` the suggestion shows is the gain, not the total. Never
          // negative: relaxing a dimension can only widen the match set.
          additional: Math.max(0, Number(row[`without_${index}`] ?? 0) - current),
        }))
        // Most useful suggestion first, so the caller renders an order rather
        // than inventing one.
        .sort((a, b) => b.additional - a.additional);

      return { current, relaxations };
    },
  };
}

/**
 * The animal columns, spelled out so the page query can add `COUNT(*) OVER()`
 * alongside them — `db.select()` with no argument cannot be extended.
 */
function getAnimalColumns() {
  return {
    id: animals.id,
    shelterId: animals.shelterId,
    name: animals.name,
    species: animals.species,
    sex: animals.sex,
    size: animals.size,
    age: animals.age,
    ageAnchorAt: animals.ageAnchorAt,
    waitAnchorAt: animals.waitAnchorAt,
    descriptionUk: animals.descriptionUk,
    descriptionEnText: animals.descriptionEnText,
    descriptionEnProvenance: animals.descriptionEnProvenance,
    photos: animals.photos,
    vaccination: animals.vaccination,
    spayNeuter: animals.spayNeuter,
    documentReadiness: animals.documentReadiness,
    listing: animals.listing,
    listingKind: animals.listingKind,
    publicLocation: animals.publicLocation,
    cityId: animals.cityId,
    createdAt: animals.createdAt,
    lastUpdatedAt: animals.lastUpdatedAt,
  };
}

async function countMatching(db: Database, where: SQL | undefined): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(animals)
    .where(where);
  return rows[0]?.total ?? 0;
}

/**
 * `COUNT(DISTINCT shelter_id)`, which the page query's window function cannot
 * answer — a different aggregate, so a different query, bundled into the same
 * handler call so the client still makes one round-trip.
 */
async function countShelters(db: Database, where: SQL | undefined): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(DISTINCT ${animals.shelterId})`.mapWith(Number) })
    .from(animals)
    .where(where);
  return rows[0]?.total ?? 0;
}
