import {
  AGE_BUCKETS,
  type AgeBucket,
  ANIMAL_SEXES,
  type AnimalId,
  type AnimalSex,
  type CityId,
  clampGalleryPage,
  type DiscoverableAnimal,
  FEED_FILTER_DIMENSIONS,
  type FeedFilterDimension,
  type FeedFilters,
  type GalleryScope,
  type GallerySort,
  galleryPageCount,
  isConstrained,
  maxNavigablePage,
  relaxDimension,
  SIZE_BUCKETS,
  type SizeBucket,
} from "@opika/domain";
import { and, asc, desc, type SQL, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import {
  buildDiscoverabilityPredicate,
  buildFeedPredicate,
  buildFilterPredicate,
  buildScopePredicate,
} from "./feed-predicate";
import { rowToDiscoverableAnimal } from "./mappers";

export type GalleryPage = {
  readonly items: readonly DiscoverableAnimal[];
  /** Every match, not just this page, and uncapped - the count is honest even
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

/** Matches per option of each filter selector, the selector's own choice ignored. */
export type GalleryFacetCounts = {
  /** Only cities with at least one discoverable animal; any other city counts zero. */
  readonly cities: readonly { readonly cityId: CityId; readonly count: number }[];
  readonly ages: Readonly<Record<AgeBucket, number>>;
  readonly sizes: Readonly<Record<SizeBucket, number>>;
  readonly sexes: Readonly<Record<AnimalSex, number>>;
};

export type NeighbourRow = { readonly id: AnimalId; readonly name: string };

/** Prev/next around one animal, under one `(filters, sort, scope)`. */
export type Neighbours = {
  readonly prev: NeighbourRow | null;
  readonly next: NeighbourRow | null;
};

/**
 * `ORDER BY` for each sort mode, as the ordering tuple the matching partial
 * index provides - `(last_confirmed_at DESC, id)` for `animals_feed_idx` /
 * `animals_feed_unfiltered_idx`, `(wait_anchor_at ASC, id)` for the two
 * wait-anchor indexes. Diverging from these is how a `Sort` node appears.
 */
function orderingFor(sort: GallerySort): SQL[] {
  switch (sort) {
    case "freshest":
      return [desc(animals.lastConfirmedAt), asc(animals.id)];
    case "longest_waiting":
      // NULLS LAST matches the index declaration. No discoverable row should
      // have a null anchor at all - the migration's own guard refuses to leave
      // one - but the index has to declare an ordering for nulls regardless,
      // and the query has to ask for the same one.
      return [sql`${animals.waitAnchorAt} ASC NULLS LAST`, asc(animals.id)];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = sort;
      return unreachable;
    }
  }
}

/**
 * The mirror of `orderingFor`, for the "prev" direction: scanning toward a
 * seek point from the opposite end, so `LIMIT 1` returns the closest row
 * rather than an arbitrary one further away.
 *
 * No `NULLS` clause for `longest_waiting`, unlike `orderingFor`: every row
 * this ordering runs against already passed `buildFeedPredicate`, which
 * restricts to `DISCOVERABLE_LISTING_KINDS` - and `waitAnchorOf` is
 * non-null for exactly those kinds. There is no null row in the result set
 * for a `NULLS` clause to place.
 */
function reverseOrderingFor(sort: GallerySort): SQL[] {
  switch (sort) {
    case "freshest":
      return [asc(animals.lastConfirmedAt), desc(animals.id)];
    case "longest_waiting":
      return [desc(animals.waitAnchorAt), desc(animals.id)];
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = sort;
      return unreachable;
    }
  }
}

/** The column `orderingFor`/`reverseOrderingFor` sort on for this mode. */
function anchorColumnFor(sort: GallerySort) {
  switch (sort) {
    case "freshest":
      return animals.lastConfirmedAt;
    case "longest_waiting":
      return animals.waitAnchorAt;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = sort;
      return unreachable;
    }
  }
}

/**
 * "Give me the row that comes after `animalId` in `orderingFor(sort)`'s
 * order" - `feed-repo.ts`'s own keyset-cursor predicate, generalised to the
 * sort mode the gallery also offers. `direction` flips both halves of the
 * comparison (which side of the anchor, which side of a tie on `id`), never
 * only one - "prev" is "next" read backwards, not a different rule.
 *
 * The anchor is a scalar subquery on `animalId`, not a value fetched into
 * JS first: that keeps the comparison inside Postgres at full `timestamptz`
 * precision (a `Date` round-trip would truncate to milliseconds), and it
 * makes an unknown id or a null anchor (draft, adopted, withdrawn) answer
 * themselves - the subquery returns `NULL`, every comparison against `NULL`
 * is `NULL`, and the `WHERE` matches nothing. No separate check needed for
 * either case.
 */
function seekCondition(sort: GallerySort, direction: "prev" | "next", animalId: AnimalId): SQL {
  const column = anchorColumnFor(sort);
  const anchor = sql`(SELECT ${column} FROM ${animals} WHERE ${animals.id} = ${animalId})`;
  const primaryIsDescending = sort === "freshest";
  const wantGreater = direction === "next" ? !primaryIsDescending : primaryIsDescending;
  const tieWantsGreaterId = direction === "next";

  const primary = wantGreater ? sql`${column} > ${anchor}` : sql`${column} < ${anchor}`;
  const tie = tieWantsGreaterId
    ? sql`${animals.id} > ${animalId}`
    : sql`${animals.id} < ${animalId}`;

  return sql`(${primary} OR (${column} = ${anchor} AND ${tie}))`;
}

async function fetchNeighbour(
  db: Database,
  where: SQL | undefined,
  sort: GallerySort,
  direction: "prev" | "next",
  animalId: AnimalId,
): Promise<NeighbourRow | undefined> {
  const condition = seekCondition(sort, direction, animalId);
  const order = direction === "next" ? orderingFor(sort) : reverseOrderingFor(sort);
  const rows = await db
    .select({ id: animals.id, name: animals.name })
    .from(animals)
    .where(and(where, condition))
    .orderBy(...order)
    .limit(1);
  return rows[0];
}

export function galleryRepo(db: Database) {
  return {
    /**
     * One numbered page, with the totals the page links are drawn from.
     *
     * `OFFSET`, not a keyset cursor - the named exception in
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
     * time passed - and a numbered, shareable, crawlable page whose contents
     * shift between two requests is not reproducible, which is the whole
     * premise of this surface.
     *
     * `scope` is required here, unlike in the contract (which defaults it), so
     * no repository caller lists everyone by leaving a field out. A shelter
     * scope narrows the same predicate, so its page, totals and navigable bound
     * are this method's, unchanged.
     */
    async list(opts: {
      filters: FeedFilters;
      scope: GalleryScope;
      sort: GallerySort;
      page: number;
      pageSize: number;
      now: Date;
    }): Promise<GalleryPage> {
      const conditions = [
        ...buildFeedPredicate(opts.filters, opts.now),
        ...buildScopePredicate(opts.scope),
      ];
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
          items: first.rows.map(rowToDiscoverableAnimal),
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
        // Genuinely no matches - or a page that is in range and simply empty,
        // which the predicate makes impossible but which costs nothing to
        // handle honestly rather than by re-running the same query.
        return { items: [], totalMatching, totalShelters, totalPages, page };
      }

      const clamped = await fetchPage(page);
      return {
        items: clamped.rows.map(rowToDiscoverableAnimal),
        totalMatching,
        totalShelters,
        totalPages,
        page,
      };
    },

    /**
     * How many more animals each currently-applied filter is hiding.
     *
     * One scan with a `COUNT(*) FILTER (...)` per constrained dimension - the
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

      // A typed `.select()`, never a raw `db.execute()`: the raw result is a
      // `RowList` array on postgres-js but `{ rows, fields }` on neon-http, so
      // reading it as an array gave `[]` in production and every count 0
      // (`raw-execute-reads.test.ts`). The query builder maps rows the same way
      // on both drivers, and `.mapWith(Number)` turns `count(*)`'s bigint
      // string into a number as `countMatching` does.
      const columns: Record<string, SQL.Aliased<number>> = {
        current: sql<number>`count(*) FILTER (WHERE ${currentFilter})`
          .mapWith(Number)
          .as("current"),
      };
      for (const [index, dimension] of constrained.entries()) {
        const relaxed =
          and(...buildFilterPredicate(relaxDimension(opts.filters, dimension), opts.now)) ??
          sql`TRUE`;
        columns[`without_${index}`] = sql<number>`count(*) FILTER (WHERE ${relaxed})`
          .mapWith(Number)
          .as(`without_${index}`);
      }

      const [row = {}] = await db.select(columns).from(animals).where(base);

      const current = row["current"] ?? 0;
      const relaxations = constrained
        .map((dimension, index) => ({
          dimension,
          // The `+N` the suggestion shows is the gain, not the total. Never
          // negative: relaxing a dimension can only widen the match set.
          additional: Math.max(0, (row[`without_${index}`] ?? 0) - current),
        }))
        // Most useful suggestion first, so the caller renders an order rather
        // than inventing one.
        .sort((a, b) => b.additional - a.additional);

      return { current, relaxations };
    },

    /**
     * The count beside each option in the filter selectors: how many animals
     * `list` would match with that option alone chosen on its dimension and
     * every other dimension as given. The dimension's own selection is
     * replaced, not added to, so picking options never shrinks their siblings.
     *
     * One statement, one scan: a `COUNT(*) FILTER (...)` per option, each from
     * `buildFilterPredicate` over that option's filter set, so a count cannot
     * disagree with the list it promises. Grouping by city gives the city
     * selector its counts directly (city relaxed, the rest applied); the other
     * selectors' counts are sums over the groups. A typed `.select()`, never a
     * raw `db.execute()`, for the driver reason `relaxationCounts` gives.
     */
    async facetCounts(opts: { filters: FeedFilters; now: Date }): Promise<GalleryFacetCounts> {
      const counted: Record<string, SQL.Aliased<number>> = {};
      const countWhere = (alias: `n_${string}`, filters: FeedFilters) => {
        const where = and(...buildFilterPredicate(filters, opts.now)) ?? sql`TRUE`;
        counted[alias] = sql<number>`count(*) FILTER (WHERE ${where})`.mapWith(Number).as(alias);
      };
      countWhere("n_city", relaxDimension(opts.filters, "cities"));
      for (const age of AGE_BUCKETS)
        countWhere(`n_age_${age}`, { ...opts.filters, ages: only(age) });
      for (const size of SIZE_BUCKETS) {
        countWhere(`n_size_${size}`, { ...opts.filters, sizes: only(size) });
      }
      for (const sex of ANIMAL_SEXES)
        countWhere(`n_sex_${sex}`, { ...opts.filters, sexes: only(sex) });

      const rows = await db
        .select({ cityId: animals.cityId, n: counted })
        .from(animals)
        .where(and(...buildDiscoverabilityPredicate()))
        .groupBy(animals.cityId)
        .orderBy(animals.cityId);

      const total = (alias: `n_${string}`): number =>
        rows.reduce((sum, row) => sum + (row.n[alias] ?? 0), 0);
      const tally = <T extends string>(values: readonly T[], prefix: string) =>
        Object.fromEntries(values.map((value) => [value, total(`n_${prefix}_${value}`)])) as Record<
          T,
          number
        >;

      return {
        cities: rows.map((row) => ({ cityId: row.cityId, count: row.n["n_city"] ?? 0 })),
        ages: tally(AGE_BUCKETS, "age"),
        sizes: tally(SIZE_BUCKETS, "size"),
        sexes: tally(ANIMAL_SEXES, "sex"),
      };
    },

    /**
     * Prev/next for the pet card overlay, under the same `(filters, sort,
     * scope)` as `list` - same predicate builders, same `orderingFor`/
     * `reverseOrderingFor`, so the two can't drift apart.
     *
     * The seek anchor is looked up by `animalId` inside the SQL itself
     * (`seekCondition`'s subquery), not from a position in a filtered
     * result set - which is why this still answers correctly for an animal
     * that has since dropped out of the current filters (PR 2's own
     * requirement), and why an unknown id or a non-discoverable animal
     * (draft, adopted, withdrawn - no `lastConfirmedAt`/`waitAnchorAt` to
     * seek from) both resolve to no rows rather than needing their own
     * checks here.
     */
    async neighbours(opts: {
      animalId: AnimalId;
      filters: FeedFilters;
      scope: GalleryScope;
      sort: GallerySort;
      now: Date;
    }): Promise<Neighbours> {
      const where = and(
        ...buildFeedPredicate(opts.filters, opts.now),
        ...buildScopePredicate(opts.scope),
      );

      const [prev, next] = await Promise.all([
        fetchNeighbour(db, where, opts.sort, "prev", opts.animalId),
        fetchNeighbour(db, where, opts.sort, "next", opts.animalId),
      ]);

      return { prev: prev ?? null, next: next ?? null };
    },
  };
}

/**
 * The animal columns, spelled out so the page query can add `COUNT(*) OVER()`
 * alongside them - `db.select()` with no argument cannot be extended.
 */
function getAnimalColumns() {
  return {
    id: animals.id,
    shelterId: animals.shelterId,
    name: animals.name,
    species: animals.species,
    sex: animals.sex,
    coatLength: animals.coatLength,
    size: animals.size,
    age: animals.age,
    ageAnchorAt: animals.ageAnchorAt,
    waitAnchorAt: animals.waitAnchorAt,
    lastConfirmedAt: animals.lastConfirmedAt,
    firstPublishedAt: animals.firstPublishedAt,
    descriptionUk: animals.descriptionUk,
    descriptionEnText: animals.descriptionEnText,
    descriptionEnProvenance: animals.descriptionEnProvenance,
    photos: animals.photos,
    vaccination: animals.vaccination,
    spayNeuter: animals.spayNeuter,
    documentReadiness: animals.documentReadiness,
    temperamentTraits: animals.temperamentTraits,
    temperamentCustomUk: animals.temperamentCustomUk,
    temperamentCustomEnText: animals.temperamentCustomEnText,
    temperamentCustomEnProvenance: animals.temperamentCustomEnProvenance,
    coatColour: animals.coatColour,
    coatColourCustomUk: animals.coatColourCustomUk,
    coatColourCustomEnText: animals.coatColourCustomEnText,
    coatColourCustomEnProvenance: animals.coatColourCustomEnProvenance,
    medicalNotesUk: animals.medicalNotesUk,
    medicalNotesEnText: animals.medicalNotesEnText,
    medicalNotesEnProvenance: animals.medicalNotesEnProvenance,
    listing: animals.listing,
    listingKind: animals.listingKind,
    everServedAt: animals.everServedAt,
    publicLocation: animals.publicLocation,
    cityId: animals.cityId,
    createdAt: animals.createdAt,
    lastUpdatedAt: animals.lastUpdatedAt,
    version: animals.version,
  };
}

/** A one-value selection: the filter set `list` would get with only `value` chosen. */
const only = <T>(value: T): { kind: "oneOf"; values: [T] } => ({ kind: "oneOf", values: [value] });

async function countMatching(db: Database, where: SQL | undefined): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(animals)
    .where(where);
  return rows[0]?.total ?? 0;
}

/**
 * `COUNT(DISTINCT shelter_id)`, which the page query's window function cannot
 * answer - a different aggregate, so a different query, bundled into the same
 * handler call so the client still makes one round-trip.
 */
async function countShelters(db: Database, where: SQL | undefined): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`count(DISTINCT ${animals.shelterId})`.mapWith(Number) })
    .from(animals)
    .where(where);
  return rows[0]?.total ?? 0;
}
