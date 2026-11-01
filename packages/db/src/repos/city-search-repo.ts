import type { NameScope, PlaceQuery, RegionId, SettlementKind } from "@opika/domain";
import { and, isNull, sql } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import { REGIONS } from "../geography/regions-data";
import { cities } from "../schema/cities";

/** The most rows one search returns; the contract caps its output at the same number. */
export const MAX_PLACE_RESULTS = 20;

/* Trigram matches use `%` (the extension default, 0.3, which the index serves) and then keep
   only similarity >= 0.35: below that is noise. */

export type PlaceMatch = {
  id: string;
  slug: string;
  nameUk: string;
  kind: SettlementKind;
  districtNameUk: string | null;
  hromadaNameUk: string | null;
  nameScope: NameScope;
  regionId: RegionId;
  /** The oblast as a picker prints it second ("Київська обл."). */
  regionUkShort: string;
};

const KIND_RANK = sql`CASE ${cities.kind}
  WHEN 'special_status_city' THEN 0 WHEN 'city' THEN 1 WHEN 'selyshche' THEN 2 ELSE 3 END`;

/** A LIKE pattern from user text: `%`, `_` and the escape character mean themselves. */
const likePrefix = (key: string) => `${key.replace(/[\\%_]/gu, "\\$&")}%`;

/**
 * Whether this database yields trigrams for Cyrillic. Under a `C` ctype `pg_trgm` can come out
 * empty for Cyrillic, which would leave `search_name % ...` matching nothing; the answer is asked
 * once per connection and decides whether the Cyrillic trigram branch is used or only the Latin
 * one (the stored transliteration, always ASCII). Query-builder shape only, so it behaves the same
 * on postgres-js and neon-http.
 */
const probed = new WeakMap<Database, Promise<boolean>>();
export function cyrillicTrigramsAvailable(db: Database): Promise<boolean> {
  const known = probed.get(db);
  if (known !== undefined) return known;
  const answer = db
    .select({ n: sql<number>`cardinality(show_trgm('миколаївка'))::int` })
    .from(sql`(SELECT 1) AS one`)
    .then((rows) => (rows[0]?.n ?? 0) > 0);
  probed.set(db, answer);
  // A failed probe is not remembered: one transient error must not break every search on this
  // instance for the rest of its life.
  answer.catch(() => {
    if (probed.get(db) === answer) probed.delete(db);
  });
  return answer;
}

/** Rows each index-friendly branch may contribute; the final answer is `MAX_PLACE_RESULTS`. */
export const BRANCH_LIMIT = 50;

/**
 * The search statement, unexecuted, so a sitting can `EXPLAIN` exactly what a search runs
 * (`test/neon-smoke-timings.ts`); `search` is the only caller in the app.
 *
 * One `OR` over four conditions defeats every index (a Seq Scan over ~29.7k rows), so each
 * condition is its own branch: a prefix on each key (btree `text_pattern_ops`) and a trigram match
 * on each key (GIN). Every branch carries the full ranking columns and its own ORDER BY ... LIMIT
 * 50 on the same ranking as the final one, so the global top 20 is always inside the union of the
 * branch tops: a row in the top 20 has fewer than 20 rows above it anywhere, hence fewer than 50
 * in its own branch. The rewrite therefore returns what the single-`OR` query returned.
 * `UNION` (not `UNION ALL`) dedupes a row several branches found; those copies are identical
 * because every column is computed the same way in each branch.
 */
export function searchStatement(
  db: Database,
  query: Extract<PlaceQuery, { kind: "ok" }>,
  options: { regionBias: RegionId | null },
  useCyrillicTrigrams: boolean,
) {
  const { cyrillic, latin } = query;

  const exact =
    cyrillic === null
      ? sql`(${cities.searchLatin} = ${latin})`
      : sql`(${cities.searchName} = ${cyrillic} OR ${cities.searchLatin} = ${latin})`;
  const prefix =
    cyrillic === null
      ? sql`(${cities.searchLatin} LIKE ${likePrefix(latin)})`
      : sql`(${cities.searchName} LIKE ${likePrefix(cyrillic)} OR ${cities.searchLatin} LIKE ${likePrefix(latin)})`;
  const similarity = useCyrillicTrigrams
    ? sql`greatest(similarity(${cities.searchName}, ${cyrillic}), similarity(${cities.searchLatin}, ${latin}))`
    : sql`similarity(${cities.searchLatin}, ${latin})`;
  const bias =
    options.regionBias === null
      ? sql`(0)::int`
      : sql`(${cities.regionId} = ${options.regionBias})::int`;

  const branch = (match: ReturnType<typeof sql>) =>
    db
      .select({
        id: cities.id,
        slug: cities.slug,
        nameUk: cities.nameUk,
        kind: cities.kind,
        districtNameUk: cities.districtNameUk,
        hromadaNameUk: cities.hromadaNameUk,
        nameScope: cities.nameScope,
        regionId: cities.regionId,
        exact: sql<number>`${exact}::int`.mapWith(Number).as("exact"),
        prefix: sql<number>`${prefix}::int`.mapWith(Number).as("prefix"),
        kindRank: sql<number>`${KIND_RANK}`.mapWith(Number).as("kind_rank"),
        bias: sql<number>`${bias}`.mapWith(Number).as("bias"),
        similarity: sql<number>`${similarity}`.mapWith(Number).as("similarity"),
      })
      .from(cities)
      .where(and(isNull(cities.retiredInEdition), match))
      .orderBy(
        sql`${exact}::int DESC`,
        sql`${prefix}::int DESC`,
        KIND_RANK,
        sql`${bias} DESC`,
        sql`${similarity} DESC`,
        cities.id,
      )
      .limit(BRANCH_LIMIT);

  const branches = [
    branch(sql`${cities.searchLatin} LIKE ${likePrefix(latin)}`),
    branch(
      sql`(${cities.searchLatin} % ${latin} AND similarity(${cities.searchLatin}, ${latin}) >= 0.35)`,
    ),
  ];
  if (cyrillic !== null) {
    branches.push(branch(sql`${cities.searchName} LIKE ${likePrefix(cyrillic)}`));
    if (useCyrillicTrigrams) {
      branches.push(
        branch(
          sql`(${cities.searchName} % ${cyrillic} AND similarity(${cities.searchName}, ${cyrillic}) >= 0.35)`,
        ),
      );
    }
  }
  const [first, second, ...rest] = branches;
  if (first === undefined || second === undefined) throw new Error("search has two branches");

  const col = (name: string) => sql.identifier(name);
  return union(first, second, ...rest)
    .orderBy(
      sql`${col("exact")} DESC`,
      sql`${col("prefix")} DESC`,
      sql`${col("kind_rank")}`,
      sql`${col("bias")} DESC`,
      sql`${col("similarity")} DESC`,
      sql`${col("id")}`,
    )
    .limit(MAX_PLACE_RESULTS);
}

export function citySearchRepo(db: Database) {
  return {
    /**
     * Prefix on either key, or a trigram match on either key. Ranked exact, then prefix, then
     * trigram; within a tier by settlement kind (cities before villages), the caller's oblast, and
     * similarity; the last tie by name in Ukrainian order. Retired settlements are never
     * returned; every region is searched alike. `cyrillicTrigrams` is injectable for the fallback test;
     * normally it is probed.
     */
    async search(
      query: Extract<PlaceQuery, { kind: "ok" }>,
      options: {
        regionBias: RegionId | null;
        cyrillicTrigrams?: boolean;
      },
    ): Promise<PlaceMatch[]> {
      const { cyrillic } = query;
      const useCyrillicTrigrams =
        cyrillic !== null && (options.cyrillicTrigrams ?? (await cyrillicTrigramsAvailable(db)));
      const rows = await searchStatement(db, query, options, useCyrillicTrigrams);

      // Ties in everything above read in Ukrainian alphabetical order (a database collation would
      // sort Є, І, Ї and Ґ by code point); a stable sort leaves the SQL order for the rest.
      return rows
        .sort(
          (a, b) =>
            b.exact - a.exact ||
            b.prefix - a.prefix ||
            a.kindRank - b.kindRank ||
            b.bias - a.bias ||
            b.similarity - a.similarity ||
            a.nameUk.localeCompare(b.nameUk, "uk"),
        )
        .map(({ exact: _e, prefix: _p, kindRank: _k, bias: _b, similarity: _s, ...match }) => ({
          ...match,
          regionUkShort: REGIONS.find((r) => r.id === match.regionId)?.name.ukShort ?? "",
        }));
    },
  };
}
