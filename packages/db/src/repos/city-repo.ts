import { type City, type CityId, CityIdSchema } from "@opika/domain";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "../client";
import { cities } from "../schema/cities";
import { citySlugAliases } from "../schema/city-slug-aliases";
import { cityToRow, rowToCity } from "./mappers";

/** How a `?misto=` token reached its city: the current slug, a former slug, or a pre-slug id. */
export type CityTokenResolution = {
  readonly token: string;
  readonly city: City | null;
  readonly via: "slug" | "alias" | "id" | null;
};

export function cityRepo(db: Database) {
  return {
    async findById(id: CityId): Promise<City | null> {
      const rows = await db.select().from(cities).where(eq(cities.id, id)).limit(1);
      const row = rows[0];
      return row ? rowToCity(row) : null;
    },

    /** `findById`, but not a retired settlement (the picker never offers one either; regions are not special). */
    async findCurrentById(id: CityId): Promise<City | null> {
      const rows = await db
        .select()
        .from(cities)
        .where(and(eq(cities.id, id), isNull(cities.retiredInEdition)))
        .limit(1);
      const row = rows[0];
      return row ? rowToCity(row) : null;
    },

    /**
     * The cities behind a handful of ids (a page's cards, a filter's picks), by primary key. The
     * public pages read city names through this and never as a whole-table read: with
     * every settlement in the table, the full list is not something a page may ship.
     */
    async findByIds(ids: readonly CityId[]): Promise<readonly City[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select()
        .from(cities)
        .where(inArray(cities.id, [...new Set(ids)]));
      return rows.map(rowToCity);
    },

    /**
     * Resolves URL tokens in one round trip's worth of queries: a current slug, a former slug from
     * `city_slug_aliases`, or a well-formed legacy id. An unknown token resolves to null (a stale
     * link degrades, it is never an error). The caller bounds how many tokens it passes.
     */
    async resolveTokens(tokens: readonly string[]): Promise<readonly CityTokenResolution[]> {
      if (tokens.length === 0) return [];
      const unique = [...new Set(tokens)];
      const idTokens = unique.filter((token) => CityIdSchema.safeParse(token).success);

      const [direct, aliased] = await Promise.all([
        db
          .select()
          .from(cities)
          .where(
            idTokens.length > 0
              ? or(inArray(cities.slug, unique), inArray(cities.id, idTokens as CityId[]))
              : inArray(cities.slug, unique),
          ),
        db
          .select({ alias: citySlugAliases.slug, city: cities })
          .from(citySlugAliases)
          .innerJoin(cities, eq(cities.id, citySlugAliases.cityId))
          .where(inArray(citySlugAliases.slug, unique)),
      ]);

      const bySlug = new Map(direct.map((row) => [row.slug, row]));
      const byId = new Map(direct.map((row) => [row.id as string, row]));
      const byAlias = new Map(aliased.map((row) => [row.alias, row.city]));

      return unique.map((token): CityTokenResolution => {
        // A current slug beats an alias beats an id; the importer keeps slugs and aliases disjoint.
        const slugRow = bySlug.get(token);
        if (slugRow) return { token, city: rowToCity(slugRow), via: "slug" };
        const aliasRow = byAlias.get(token);
        if (aliasRow) return { token, city: rowToCity(aliasRow), via: "alias" };
        const idRow = byId.get(token);
        if (idRow) return { token, city: rowToCity(idRow), via: "id" };
        return { token, city: null, via: null };
      });
    },

    async insert(city: City): Promise<void> {
      await db.insert(cities).values(cityToRow(city));
    },

    /**
     * Inserts the cities that don't exist yet and leaves every existing row untouched, so a reseed
     * can never undo the importer's work: it renamed `brovary` to `brovary-kyivska`, gave it a
     * code, a raion and a hromada, and parked the old slug in `city_slug_aliases`. An update here
     * would make `brovary` canonical again while the alias still points the other way (a 308
     * loop) and wipe the imported fields. Conflicts on any unique key (id, slug, code) are skipped.
     */
    async insertMissing(cityList: readonly City[]): Promise<void> {
      if (cityList.length === 0) return;
      await db.insert(cities).values(cityList.map(cityToRow)).onConflictDoNothing();
    },

    async insertMany(cityList: readonly City[]): Promise<void> {
      if (cityList.length === 0) return;
      await db.insert(cities).values(cityList.map(cityToRow));
    },
  };
}
