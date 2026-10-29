import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { searchLatinOf, searchNameOf } from "@opika/domain";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { KYIV_CITY_REGION_ID, KYIV_OBLAST_REGION_ID } from "../src/geography/regions-data";
import { setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Migration 0020 adds the geography columns to `cities`, which already holds the 8 seeded rows on
 * every deployed database. Like 0005's test, this seeds the pre-migration shape by hand and proves
 * the backfill, the refusal of a row it does not know, and the constraints left behind.
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const TAG = "0020_nationwide_geography_schema";

const client = postgres(TEST_DATABASE_URL, { max: 1 });

// The raw client below connects before anything else creates this checkout's database, so a run
// of this file alone would otherwise find none.
beforeAll(async () => {
  await (await setupTestDatabase()).cleanup();
});

afterAll(async () => {
  // Restores tables and drizzle's own bookkeeping through the real migrator, as the other
  // hand-migrated suites do.
  await (await setupTestDatabase()).cleanup();
  await client.end();
});

async function migrationTags(): Promise<readonly string[]> {
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { readonly entries: readonly { readonly tag: string }[] };
  return journal.entries.map((entry) => entry.tag);
}

async function applyMigration(tag: string): Promise<void> {
  const sqlText = await readFile(resolve(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  for (const statement of sqlText.split("--> statement-breakpoint")) {
    if (statement.trim().length > 0) await client.unsafe(statement);
  }
}

async function resetToPreGeographyState(): Promise<void> {
  await client.unsafe(
    "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
  );
  const tags = await migrationTags();
  const index = tags.indexOf(TAG);
  expect(index, `${TAG} is not in the migration journal`).toBeGreaterThan(-1);
  for (const tag of tags.slice(0, index)) await applyMigration(tag);
}

const SEEDED = [
  { id: "c1000000-0000-4000-8000-000000000000", uk: "Київ", en: "Kyiv", slug: "kyiv" },
  { id: "c1000000-0000-4000-8000-000000000001", uk: "Бровари", en: "Brovary", slug: "brovary" },
  { id: "c1000000-0000-4000-8000-000000000002", uk: "Ірпінь", en: "Irpin", slug: "irpin" },
  { id: "c1000000-0000-4000-8000-000000000003", uk: "Буча", en: "Bucha", slug: "bucha" },
  {
    id: "c1000000-0000-4000-8000-000000000004",
    uk: "Вишгород",
    en: "Vyshhorod",
    slug: "vyshhorod",
  },
  {
    id: "c1000000-0000-4000-8000-000000000005",
    uk: "Бориспіль",
    en: "Boryspil",
    slug: "boryspil",
  },
  { id: "c1000000-0000-4000-8000-000000000006", uk: "Фастів", en: "Fastiv", slug: "fastiv" },
  {
    id: "c1000000-0000-4000-8000-000000000007",
    uk: "Біла Церква",
    en: "Bila Tserkva",
    slug: "bila-tserkva",
  },
] as const;

async function insertPreMigrationCity(city: { id: string; uk: string; en: string; slug: string }) {
  await client`
    INSERT INTO cities (id, slug, name_uk, name_en_text, name_en_provenance, centroid_lat, centroid_lng)
    VALUES (${city.id}, ${city.slug}, ${city.uk}, ${city.en}, 'human', ${50.45}, ${30.52})`;
}

type Row = Record<string, string | number | null>;

async function rows(query: string): Promise<Row[]> {
  return (await client.unsafe(query)) as unknown as Row[];
}

describe("0020 cities geography backfill", () => {
  beforeEach(async () => {
    await resetToPreGeographyState();
  });

  it("backfills the 8 seeded rows: region, kind, scope, and search keys equal the domain functions", async () => {
    for (const city of SEEDED) await insertPreMigrationCity(city);

    await applyMigration(TAG);

    const result = await rows(
      "SELECT id, region_id, kind, name_scope, search_name, search_latin, centroid_lat, centroid_source FROM cities ORDER BY id",
    );
    expect(result).toHaveLength(8);
    for (const city of SEEDED) {
      const row = result.find((r) => r.id === city.id);
      expect(row, city.en).toBeDefined();
      expect(row?.search_name).toBe(searchNameOf(city.uk));
      expect(row?.search_latin).toBe(searchLatinOf(city.uk));
      expect(row?.name_scope).toBe("unique_in_ukraine");
      expect(row?.centroid_lat).toBe(50.45);
      expect(row?.centroid_source).toBe("manual");
    }
    expect(result.find((r) => r.id === SEEDED[0].id)).toMatchObject({
      region_id: KYIV_CITY_REGION_ID,
      kind: "special_status_city",
    });
    for (const city of SEEDED.slice(1)) {
      expect(result.find((r) => r.id === city.id)).toMatchObject({
        region_id: KYIV_OBLAST_REGION_ID,
        kind: "city",
      });
    }
  });

  it("works on an empty cities table (every fresh database)", async () => {
    await applyMigration(TAG);
    expect(await rows("SELECT count(*)::int AS n FROM cities")).toEqual([{ n: 0 }]);
    expect(await rows("SELECT count(*)::int AS n FROM regions")).toEqual([{ n: 27 }]);
  });

  it("aborts rather than guess the region of a city it does not know", async () => {
    await insertPreMigrationCity({
      id: "99999999-0000-4000-8000-000000000000",
      uk: "Невідоме",
      en: "Unknown",
      slug: "unknown",
    });

    await expect(applyMigration(TAG)).rejects.toThrow(/geography backfill is incomplete/);
  });

  it("installs pg_trgm, and Cyrillic and Latin keys both produce trigrams", async () => {
    await applyMigration(TAG);
    expect(await rows("SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'")).toHaveLength(
      1,
    );
    const trigrams = await rows(
      "SELECT cardinality(show_trgm('миколаївка'))::int AS cyrillic, cardinality(show_trgm('mykolaivka'))::int AS latin",
    );
    expect(trigrams[0]?.cyrillic).toBeGreaterThan(0);
    expect(trigrams[0]?.latin).toBeGreaterThan(0);
  });

  it("creates the four search indexes", async () => {
    await applyMigration(TAG);
    const indexes = await rows(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'cities' AND indexname LIKE 'cities_search_%' ORDER BY indexname",
    );
    expect(indexes.map((i) => i.indexname)).toEqual([
      "cities_search_latin_prefix_idx",
      "cities_search_latin_trgm_idx",
      "cities_search_name_prefix_idx",
      "cities_search_name_trgm_idx",
    ]);
  });

  describe("constraints left behind", () => {
    const CITY_ID = "a0000000-0000-4000-8000-000000000001";
    const insertNew = (overrides: Record<string, string | number | null> = {}) => {
      const values: Record<string, string | number | null> = {
        id: CITY_ID,
        slug: "novi-test",
        name_uk: "Нові",
        name_en_text: "Novi",
        name_en_provenance: "human",
        region_id: KYIV_OBLAST_REGION_ID,
        kind: "village",
        name_scope: "unique_in_region",
        search_name: "нові",
        search_latin: "novi",
        katottg_code: "UA32060010010012345",
        ...overrides,
      };
      const columns = Object.keys(values);
      return client.unsafe(
        `INSERT INTO cities (${columns.join(", ")}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(", ")})`,
        Object.values(values),
      );
    };

    beforeEach(async () => {
      await applyMigration(TAG);
    });

    it("accepts a settlement with no centroid at all", async () => {
      await expect(insertNew()).resolves.toBeDefined();
    });

    it("refuses a centroid that is only half recorded", async () => {
      await expect(insertNew({ centroid_lat: 50.1 })).rejects.toThrow(
        /cities_centroid_all_or_none/,
      );
      await expect(insertNew({ centroid_lat: 50.1, centroid_lng: 30.1 })).rejects.toThrow(
        /cities_centroid_all_or_none/,
      );
      await expect(insertNew({ centroid_source: "manual" })).rejects.toThrow(
        /cities_centroid_all_or_none/,
      );
    });

    it("refuses a malformed or duplicated KATOTTG code", async () => {
      await expect(insertNew({ katottg_code: "UA123" })).rejects.toThrow(
        /cities_katottg_code_format/,
      );
      await insertNew();
      await expect(
        insertNew({ id: "a0000000-0000-4000-8000-000000000002", slug: "novi-test-2" }),
      ).rejects.toThrow(/cities_katottg_code_unique/);
    });

    it("refuses an unknown kind, name scope or region", async () => {
      await expect(insertNew({ kind: "hamlet" })).rejects.toThrow(/cities_kind_values/);
      await expect(insertNew({ name_scope: "unique" })).rejects.toThrow(/cities_name_scope_values/);
      await expect(
        insertNew({ region_id: "00000000-0000-4000-8000-000000000000" }),
      ).rejects.toThrow(/cities_region_id_regions_id_fk/);
    });

    it("keeps slug aliases tied to a real city and to a known reason", async () => {
      await insertNew();
      await client`INSERT INTO city_slug_aliases (slug, city_id, reason) VALUES ('novi-old', ${CITY_ID}, 'renamed')`;
      await expect(
        client`INSERT INTO city_slug_aliases (slug, city_id, reason) VALUES ('x', ${CITY_ID}, 'other')`,
      ).rejects.toThrow(/city_slug_aliases_reason_values/);
      await expect(
        client`INSERT INTO city_slug_aliases (slug, city_id, reason) VALUES ('y', 'a0000000-0000-4000-8000-0000000000ff', 'legacy')`,
      ).rejects.toThrow(/city_slug_aliases_city_id_cities_id_fk/);
      await expect(
        client`INSERT INTO city_slug_aliases (slug, city_id, reason) VALUES ('novi-old', ${CITY_ID}, 'legacy')`,
      ).rejects.toThrow();
    });
  });
});
