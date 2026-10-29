import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { KYIV_CITY_REGION_ID, KYIV_OBLAST_REGION_ID, REGIONS } from "../src/geography/regions-data";
import { cityRepo } from "../src/repos/city-repo";
import { citySlugAliases } from "../src/schema/city-slug-aliases";
import { makeCity } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

/**
 * Nationwide track N1: the checks for migration 0020, appended after the existing smoke steps
 * (`neon-smoke.ts` calls this from `main`, so no existing step is edited). Reads go through the
 * query builder, never a raw `db.execute`, because neon-http and postgres-js return different
 * raw result shapes. The fixture rows stay on the child branch, which is thrown away.
 */
export async function runGeographySmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });
  const one = sql`(SELECT 1) AS one`;

  const [extension] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`pg_extension`)
    .where(sql`extname = 'pg_trgm'`);
  check("pg_trgm is installed", extension?.n === 1, `pg_extension rows: ${extension?.n ?? "none"}`);

  // The risk the proposal names: under a C ctype Cyrillic can yield no trigrams, which would leave
  // typo tolerance on the Latin key only. The values are reported either way.
  const [trigrams] = await db
    .select({
      cyrillic: sql<number>`cardinality(show_trgm('миколаївка'))::int`,
      latin: sql<number>`cardinality(show_trgm('mykolaivka'))::int`,
      lowered: sql<string>`lower('Б')`,
    })
    .from(one);
  check(
    "pg_trgm yields trigrams for Latin, and for Cyrillic (decides whether typo tolerance covers Cyrillic)",
    (trigrams?.latin ?? 0) > 0 && (trigrams?.cyrillic ?? 0) > 0,
    `cyrillic ${trigrams?.cyrillic ?? "none"}, latin ${trigrams?.latin ?? "none"}, lower('Б') = '${trigrams?.lowered ?? "none"}'`,
  );

  const regionRows = await db
    .select({ kind: sql<string>`kind`, n: sql<number>`count(*)::int` })
    .from(sql`regions`)
    .groupBy(sql`kind`)
    .orderBy(sql`kind`);
  const byKind = regionRows.map((r) => `${r.kind}:${r.n}`).join(",");
  check(
    "regions holds 27 rows: 24 oblasts, Crimea, Kyiv and Sevastopol",
    byKind === "autonomous_republic:1,oblast:24,special_status_city:2" && REGIONS.length === 27,
    byKind,
  );

  const [nullable] = await db
    .select({
      regionNullable: sql<string>`max(CASE WHEN column_name = 'region_id' THEN is_nullable END)`,
      centroidNullable: sql<string>`max(CASE WHEN column_name = 'centroid_lat' THEN is_nullable END)`,
    })
    .from(sql`information_schema.columns`)
    .where(sql`table_schema = 'public' AND table_name = 'cities'`);
  const [unfilled] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`cities`)
    .where(sql`region_id IS NULL OR search_name IS NULL OR search_latin IS NULL`);
  const [total] = await db.select({ n: sql<number>`count(*)::int` }).from(sql`cities`);
  check(
    "cities: region_id is NOT NULL, centroid is nullable, no row left unbackfilled",
    nullable?.regionNullable === "NO" && nullable?.centroidNullable === "YES" && unfilled?.n === 0,
    `region_id nullable: ${nullable?.regionNullable}, centroid_lat nullable: ${nullable?.centroidNullable}, cities: ${total?.n}, unfilled: ${unfilled?.n}`,
  );

  const settlement = makeCity({
    id: randomUUID() as never,
    kind: "village",
    regionId: KYIV_OBLAST_REGION_ID,
    name: { uk: "Миколаївка", en: { text: "Mykolaivka", provenance: "machine" } },
    district: { uk: "Броварський район" },
    hromada: { uk: "Броварська міська громада" },
    nameScope: "shared_in_district",
    centroid: { kind: "not_recorded" },
  });
  await cityRepo(db).insert(settlement);
  const read = await cityRepo(db).findById(settlement.id);
  check(
    "a settlement with no centroid round-trips through neon-http, district and hromada included",
    read !== null && JSON.stringify(read) === JSON.stringify(settlement),
    read === null ? "not found" : `kind ${read.kind}, centroid ${read.centroid.kind}`,
  );

  const [stored] = await db
    .select({ name: sql<string>`search_name`, latin: sql<string>`search_latin` })
    .from(sql`cities`)
    .where(sql`id = ${settlement.id}`);
  check(
    "the insert stored the search keys (search_name, search_latin)",
    stored?.name === "миколаївка" && stored?.latin === "mykolaivka",
    `${stored?.name ?? "none"} / ${stored?.latin ?? "none"}`,
  );

  const [prefix] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`cities`)
    .where(sql`search_name LIKE ${"микола%"} AND id = ${settlement.id}`);
  check("a prefix search on search_name finds it", prefix?.n === 1, `rows: ${prefix?.n}`);

  const [similar] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`cities`)
    .where(sql`search_latin % ${"mykolaivk"} AND id = ${settlement.id}`);
  check(
    "a trigram search on search_latin tolerates a missing letter",
    similar?.n === 1,
    `rows: ${similar?.n}`,
  );

  await db
    .insert(citySlugAliases)
    .values({ slug: `smoke-${settlement.id}`, cityId: settlement.id, reason: "renamed" });
  const [alias] = await db
    .select({ cityId: citySlugAliases.cityId })
    .from(citySlugAliases)
    .where(eq(citySlugAliases.slug, `smoke-${settlement.id}`));
  check(
    "a slug alias is written and read back",
    alias?.cityId === settlement.id,
    `${alias?.cityId}`,
  );

  const [wrongKyiv] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`cities`)
    .where(
      sql`slug = 'kyiv' AND NOT (region_id = ${KYIV_CITY_REGION_ID} AND kind = 'special_status_city')`,
    );
  const [wrongOblast] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`cities`)
    .where(
      sql`slug IN ('brovary', 'irpin', 'bucha', 'vyshhorod', 'boryspil', 'fastiv', 'bila-tserkva') AND NOT (region_id = ${KYIV_OBLAST_REGION_ID} AND kind = 'city')`,
    );
  const [seeded] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sql`cities`)
    .where(
      sql`slug IN ('kyiv', 'brovary', 'irpin', 'bucha', 'vyshhorod', 'boryspil', 'fastiv', 'bila-tserkva')`,
    );
  check(
    "all 8 seeded cities exist and were backfilled to their region and kind (look for: seeded cities present: 8, wrong: 0)",
    seeded?.n === 8 && wrongKyiv?.n === 0 && wrongOblast?.n === 0,
    `seeded cities present: ${seeded?.n}, wrong: ${(wrongKyiv?.n ?? 0) + (wrongOblast?.n ?? 0)}`,
  );

  return out;
}
