import type { NameScope, PlaceQuery, RegionId, SettlementKind } from "@opika/domain";
import { and, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { PICKER_HIDDEN_REGION_IDS, REGIONS } from "../geography/regions-data";
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

/**
 * What a settlement must satisfy to be offered by the picker, and to be accepted as a shelter's
 * address: not in a hidden region (Crimea, Sevastopol), not retired. One predicate, so the search
 * and the write-path check cannot drift apart.
 */
export const pickableCity = and(
  notInArray(cities.regionId, [...PICKER_HIDDEN_REGION_IDS]),
  isNull(cities.retiredInEdition),
);

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

export function citySearchRepo(db: Database) {
  return {
    /**
     * Prefix on either key, or a trigram match on either key. Ranked exact, then prefix, then
     * trigram; within a tier by settlement kind (cities before villages), the caller's oblast, and
     * similarity; the last tie by name in Ukrainian order. Settlements in the hidden regions and
     * retired ones are never returned. `cyrillicTrigrams` is injectable for the fallback test;
     * normally it is probed.
     */
    async search(
      query: Extract<PlaceQuery, { kind: "ok" }>,
      options: {
        regionBias: RegionId | null;
        cyrillicTrigrams?: boolean;
      },
    ): Promise<PlaceMatch[]> {
      const limit = MAX_PLACE_RESULTS;
      const { cyrillic, latin } = query;
      const useCyrillicTrigrams =
        cyrillic !== null && (options.cyrillicTrigrams ?? (await cyrillicTrigramsAvailable(db)));

      const exact =
        cyrillic === null
          ? sql`(${cities.searchLatin} = ${latin})`
          : sql`(${cities.searchName} = ${cyrillic} OR ${cities.searchLatin} = ${latin})`;
      const prefix =
        cyrillic === null
          ? sql`(${cities.searchLatin} LIKE ${likePrefix(latin)})`
          : sql`(${cities.searchName} LIKE ${likePrefix(cyrillic)} OR ${cities.searchLatin} LIKE ${likePrefix(latin)})`;
      const trigramLatin = sql`(${cities.searchLatin} % ${latin} AND similarity(${cities.searchLatin}, ${latin}) >= 0.35)`;
      const trigramCyrillic = useCyrillicTrigrams
        ? sql`(${cities.searchName} % ${cyrillic} AND similarity(${cities.searchName}, ${cyrillic}) >= 0.35)`
        : null;
      const similarity = useCyrillicTrigrams
        ? sql`greatest(similarity(${cities.searchName}, ${cyrillic}), similarity(${cities.searchLatin}, ${latin}))`
        : sql`similarity(${cities.searchLatin}, ${latin})`;
      const bias =
        options.regionBias === null
          ? sql`(0)::int`
          : sql`(${cities.regionId} = ${options.regionBias})::int`;

      const rows = await db
        .select({
          id: cities.id,
          slug: cities.slug,
          nameUk: cities.nameUk,
          kind: cities.kind,
          districtNameUk: cities.districtNameUk,
          hromadaNameUk: cities.hromadaNameUk,
          nameScope: cities.nameScope,
          regionId: cities.regionId,
          exact: sql<number>`${exact}::int`.mapWith(Number),
          prefix: sql<number>`${prefix}::int`.mapWith(Number),
          kindRank: sql<number>`${KIND_RANK}`.mapWith(Number),
          bias: sql<number>`${bias}`.mapWith(Number),
          similarity: sql<number>`${similarity}`.mapWith(Number),
        })
        .from(cities)
        .where(
          and(
            pickableCity,
            or(
              sql`${cities.searchLatin} LIKE ${likePrefix(latin)}`,
              cyrillic === null
                ? undefined
                : sql`${cities.searchName} LIKE ${likePrefix(cyrillic)}`,
              trigramLatin,
              trigramCyrillic ?? undefined,
            ),
          ),
        )
        .orderBy(
          sql`${exact}::int DESC`,
          sql`${prefix}::int DESC`,
          KIND_RANK,
          sql`${bias} DESC`,
          sql`${similarity} DESC`,
          cities.id,
        )
        .limit(limit);

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
