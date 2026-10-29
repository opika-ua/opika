import type { CityId } from "@opika/domain";
import { count, inArray, isNotNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { REGIONS } from "../geography/regions-data";
import { animals } from "../schema/animals";
import { cities } from "../schema/cities";
import { citySlugAliases } from "../schema/city-slug-aliases";
import { regions } from "../schema/regions";
import { shelters } from "../schema/shelters";
import type { ExistingAlias, ExistingCity, ImportRow, Plan } from "./plan";

/** The statement size the proposal fixed: 500 rows, each atomic, the whole run idempotent. */
export const BATCH_SIZE = 500;

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export async function loadExisting(
  db: Database,
): Promise<{ cities: ExistingCity[]; aliases: ExistingAlias[] }> {
  const rows = await db
    .select({
      id: cities.id,
      slug: cities.slug,
      katottgCode: cities.katottgCode,
      nameUk: cities.nameUk,
      nameEnText: cities.nameEnText,
      nameEnProvenance: cities.nameEnProvenance,
      regionId: cities.regionId,
      kind: cities.kind,
      districtNameUk: cities.districtNameUk,
      hromadaNameUk: cities.hromadaNameUk,
      nameScope: cities.nameScope,
      searchName: cities.searchName,
      searchLatin: cities.searchLatin,
      sourceEdition: cities.sourceEdition,
      retiredInEdition: cities.retiredInEdition,
    })
    .from(cities);
  const aliasRows = await db
    .select({ slug: citySlugAliases.slug, cityId: citySlugAliases.cityId })
    .from(citySlugAliases);
  return { cities: rows, aliases: aliasRows };
}

/** The regions table is written by migration 0020, never by the importer: it must equal the constant. */
export async function regionsMatchConstant(db: Database): Promise<boolean> {
  const rows = await db.select({ id: regions.id, code: regions.code }).from(regions);
  if (rows.length !== REGIONS.length) return false;
  const byCode = new Map(rows.map((r) => [r.code, r.id]));
  return REGIONS.every((r) => byCode.get(r.code) === r.id);
}

/** Retired settlements that a shelter or an animal still points at, by code. */
export async function referencedAmong(
  db: Database,
  retirements: Plan["retirements"],
): Promise<string[]> {
  if (retirements.length === 0) return [];
  const referenced = new Set<string>();
  for (const batch of chunks(
    retirements.map((r) => r.id),
    BATCH_SIZE,
  )) {
    for (const table of [shelters, animals]) {
      const rows = await db
        .selectDistinct({ id: table.cityId })
        .from(table)
        .where(inArray(table.cityId, batch));
      for (const row of rows) referenced.add(row.id);
    }
  }
  return retirements.filter((r) => referenced.has(r.id)).map((r) => r.code);
}

const toValues = (row: ImportRow) => ({
  id: row.id as never,
  slug: row.slug,
  nameUk: row.nameUk,
  nameEnText: row.nameEnText,
  nameEnProvenance: row.nameEnProvenance,
  regionId: row.regionId as never,
  kind: row.kind,
  katottgCode: row.katottgCode,
  districtNameUk: row.districtNameUk,
  hromadaNameUk: row.hromadaNameUk,
  nameScope: row.nameScope,
  searchName: row.searchName,
  searchLatin: row.searchLatin,
  sourceEdition: row.sourceEdition,
  retiredInEdition: null,
});

/**
 * Carries the plan out. neon-http has no interactive transactions, so each statement is atomic and
 * the run is idempotent instead: a crash leaves rows the next run completes. That holds for slug
 * renames only because their aliases are written first. Centroids are never written. Only
 * query-builder shapes, no raw `db.execute`.
 */
export async function applyPlan(db: Database, plan: Plan, edition: string): Promise<void> {
  // Aliases first: a run that dies after a slug changed would otherwise rerun to "nothing to do"
  // with the old URL lost. An alias written early is harmless (no foreign key to the slug), and
  // the rerun finds it again and still performs the rename.
  for (const batch of chunks(plan.aliases, BATCH_SIZE)) {
    await db
      .insert(citySlugAliases)
      .values(batch.map((a) => ({ ...a, cityId: a.cityId as CityId })))
      .onConflictDoNothing({ target: citySlugAliases.slug });
  }
  for (const row of plan.adoptions) {
    await db
      .update(cities)
      .set({
        slug: row.slug,
        katottgCode: row.katottgCode,
        regionId: row.regionId as never,
        kind: row.kind,
        districtNameUk: row.districtNameUk,
        hromadaNameUk: row.hromadaNameUk,
        nameScope: row.nameScope,
        sourceEdition: row.sourceEdition,
        retiredInEdition: null,
      })
      .where(sql`${cities.id} = ${row.id}`);
  }
  for (const batch of chunks(plan.inserts, BATCH_SIZE)) {
    await db.insert(cities).values(batch.map(toValues)).onConflictDoNothing({ target: cities.id });
  }
  for (const batch of chunks(plan.updates, BATCH_SIZE)) {
    await db
      .insert(cities)
      .values(batch.map(toValues))
      .onConflictDoUpdate({
        target: cities.id,
        set: {
          slug: sql`excluded.slug`,
          nameUk: sql`excluded.name_uk`,
          nameEnText: sql`excluded.name_en_text`,
          regionId: sql`excluded.region_id`,
          kind: sql`excluded.kind`,
          districtNameUk: sql`excluded.district_name_uk`,
          hromadaNameUk: sql`excluded.hromada_name_uk`,
          nameScope: sql`excluded.name_scope`,
          searchName: sql`excluded.search_name`,
          searchLatin: sql`excluded.search_latin`,
          sourceEdition: sql`excluded.source_edition`,
          retiredInEdition: sql`NULL`,
        },
      });
  }
  for (const batch of chunks(plan.retirements, BATCH_SIZE)) {
    await db
      .update(cities)
      .set({ retiredInEdition: edition })
      .where(
        inArray(
          cities.id,
          batch.map((r) => r.id as CityId),
        ),
      );
  }
}

/** What the table holds after a run, for the verification block. Counts only. */
export async function summariseStored(db: Database): Promise<{
  withCode: number;
  withoutCode: number;
  aliases: number;
  retired: number;
}> {
  const [withCode] = await db
    .select({ n: count() })
    .from(cities)
    .where(isNotNull(cities.katottgCode));
  const [total] = await db.select({ n: count() }).from(cities);
  const [aliases] = await db.select({ n: count() }).from(citySlugAliases);
  const [retired] = await db
    .select({ n: count() })
    .from(cities)
    .where(isNotNull(cities.retiredInEdition));
  return {
    withCode: withCode?.n ?? 0,
    withoutCode: (total?.n ?? 0) - (withCode?.n ?? 0),
    aliases: aliases?.n ?? 0,
    retired: retired?.n ?? 0,
  };
}
