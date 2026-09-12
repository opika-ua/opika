import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { citySlugOf } from "@opika/domain";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setupTestDatabase } from "../src/test-utils/index";

/**
 * Migration `0005_nervous_shinko_yamashiro` (`packages/db/drizzle`) adds
 * `cities.slug` — hand-edited, not drizzle-kit's plain generated form, for
 * exactly the reason this file exists to prove: `ADD COLUMN ... NOT NULL`
 * with no default fails outright against a `cities` table that already has
 * rows, which is the real state of every deployed database this repo has
 * (the 8 seeded cities O-9 measured against Neon). This test seeds the
 * *pre-migration* shape by hand (raw SQL, the same technique
 * `wait-anchor-backfill.test.ts` uses for `0004`) and proves the migration
 * both backfills the known corpus correctly and refuses to guess at a row
 * it doesn't recognise, rather than trusting the migration's own SQL by
 * reading it.
 */

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://opika:opika@localhost:5433/opika_test";

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const BACKFILL_TAG = "0005_nervous_shinko_yamashiro";

type JournalEntry = { readonly tag: string };

const client = postgres(TEST_DATABASE_URL, { max: 1 });

afterAll(async () => {
  // This file (like `wait-anchor-backfill.test.ts`) drops `drizzle`'s own
  // migration-tracking schema in `resetToPreSlugState` below and never
  // repopulates it via the real migrator — most other test files' own
  // `setupTestDatabase()` calls do, so this only surfaces when one of these
  // two hand-migrated files happens to be the last to touch the shared
  // `opika_test` database. Confirmed reachable, not theoretical: without
  // this, the harness's own `drizzle-kit migrate` step failed outright
  // (tried to replay `CREATE TABLE cities` from migration 0000 against a
  // table that already existed, fully migrated, with an empty tracking
  // table) after a `pnpm --filter @opika/db test` run happened to finish
  // with this file's tables left in their final shape but no tracking rows
  // to match. Restoring via the real migrator (not another raw-SQL replay)
  // leaves both the tables and drizzle's own bookkeeping consistent again.
  await (await setupTestDatabase()).cleanup();
  await client.end();
});

async function migrationTags(): Promise<readonly string[]> {
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { readonly entries: readonly JournalEntry[] };
  return journal.entries.map((entry) => entry.tag);
}

async function applyMigration(tag: string): Promise<void> {
  const sqlText = await readFile(resolve(MIGRATIONS_DIR, `${tag}.sql`), "utf8");
  for (const statement of sqlText.split("--> statement-breakpoint")) {
    if (statement.trim().length > 0) {
      await client.unsafe(statement);
    }
  }
}

/** Drop everything and migrate to the state immediately before this migration. */
async function resetToPreSlugState(): Promise<void> {
  await client.unsafe(`
    DROP TABLE IF EXISTS sessions CASCADE;
    DROP TABLE IF EXISTS reveals CASCADE;
    DROP TABLE IF EXISTS swipes CASCADE;
    DROP TABLE IF EXISTS animals CASCADE;
    DROP TABLE IF EXISTS adopters CASCADE;
    DROP TABLE IF EXISTS shelters CASCADE;
    DROP TABLE IF EXISTS cities CASCADE;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);

  const tags = await migrationTags();
  const backfillIndex = tags.indexOf(BACKFILL_TAG);
  expect(backfillIndex, `${BACKFILL_TAG} is not in the migration journal`).toBeGreaterThan(-1);

  for (const tag of tags.slice(0, backfillIndex)) {
    await applyMigration(tag);
  }
}

/** The exact 8 cities `seed.ts`'s `buildCities()` produces against an empty
 * database — deterministic ids (`seededUuid("c1000000", i)`), real names —
 * i.e. the actual shape of every database this migration will ever run
 * against for real, not a synthetic stand-in. `nameEn` is `seed.ts`'s own
 * `CITY_DATA.name.en.text` for each — the field the migration's hardcoded
 * slugs are now computed from (2026-09-12), not `nameUk`. */
const REAL_SEEDED_CITIES = [
  { id: "c1000000-0000-4000-8000-000000000000", nameUk: "Київ", nameEn: "Kyiv" },
  { id: "c1000000-0000-4000-8000-000000000001", nameUk: "Бровари", nameEn: "Brovary" },
  { id: "c1000000-0000-4000-8000-000000000002", nameUk: "Ірпінь", nameEn: "Irpin" },
  { id: "c1000000-0000-4000-8000-000000000003", nameUk: "Буча", nameEn: "Bucha" },
  { id: "c1000000-0000-4000-8000-000000000004", nameUk: "Вишгород", nameEn: "Vyshhorod" },
  { id: "c1000000-0000-4000-8000-000000000005", nameUk: "Бориспіль", nameEn: "Boryspil" },
  { id: "c1000000-0000-4000-8000-000000000006", nameUk: "Фастів", nameEn: "Fastiv" },
  { id: "c1000000-0000-4000-8000-000000000007", nameUk: "Біла Церква", nameEn: "Bila Tserkva" },
] as const;

async function insertLegacyCity(
  id: string,
  nameUk: string,
  nameEn: string | null = null,
): Promise<void> {
  await client`
    INSERT INTO cities (id, name_uk, name_en_text, name_en_provenance, centroid_lat, centroid_lng)
    VALUES (${id}, ${nameUk}, ${nameEn}, ${nameEn === null ? null : "human"}, ${50.45}, ${30.52})`;
}

type SlugRow = { readonly id: string; readonly slug: string };

async function slugRows(): Promise<readonly SlugRow[]> {
  return (await client`SELECT id, slug FROM cities ORDER BY id`) as unknown as readonly SlugRow[];
}

describe("0005 cities.slug backfill", () => {
  beforeEach(async () => {
    await resetToPreSlugState();
  });

  it("backfills every one of the real seeded cities to the slug citySlugOf produces from name_en_text", async () => {
    for (const city of REAL_SEEDED_CITIES) {
      await insertLegacyCity(city.id, city.nameUk, city.nameEn);
    }

    await applyMigration(BACKFILL_TAG);

    const rows = await slugRows();
    expect(rows).toHaveLength(REAL_SEEDED_CITIES.length);
    const bySlugId = new Map(rows.map((row) => [row.id, row.slug]));
    for (const city of REAL_SEEDED_CITIES) {
      expect(bySlugId.get(city.id), `slug for ${city.nameEn}`).toBe(citySlugOf(city.nameEn));
    }
  });

  it("backfills correctly even when the table holds only a subset of the 8 — order and completeness aren't assumed", async () => {
    const subset = [REAL_SEEDED_CITIES[3], REAL_SEEDED_CITIES[0], REAL_SEEDED_CITIES[6]];
    for (const city of subset) {
      // biome-ignore lint/style/noNonNullAssertion: subset is a fixed literal of 3 real entries
      await insertLegacyCity(city!.id, city!.nameUk, city!.nameEn);
    }

    await applyMigration(BACKFILL_TAG);

    const rows = await slugRows();
    expect(rows).toHaveLength(subset.length);
    for (const row of rows) {
      const expected = subset.find((c) => c?.id === row.id);
      expect(row.slug).toBe(citySlugOf(expected?.nameEn ?? ""));
    }
  });

  it("aborts rather than silently leaving a NULL slug on a city id it doesn't recognise", async () => {
    // A row this migration's hardcoded CASE has never seen — real onboarding
    // (H2) already having added a city, or a database seeded from something
    // other than this repo's own seed.ts. Constructed with a real-shaped
    // UUID that provably isn't one of the 8 known ids. Given a real English
    // name so this reaches the slug-CASE abort specifically, not the
    // name_en_text/provenance abort tested separately below.
    await insertLegacyCity(
      "99999999-0000-4000-8000-000000000000",
      "Невідоме Місто",
      "Unknown City",
    );

    await expect(applyMigration(BACKFILL_TAG)).rejects.toThrow(/backfill is incomplete/);
  });

  /**
   * 2026-09-12 — the migration now tightens `name_en_text`/`name_en_provenance`
   * to NOT NULL before it ever touches `slug` (Oleksii's own instruction, after
   * confirming all 8 real Neon rows carry both). This is that tightening's own
   * abort path, exercised the same way the slug backfill's own abort is above:
   * a row missing the data the tightening assumes, confirmed to fail loudly
   * rather than silently truncating or nulling anything out.
   */
  it("aborts rather than tightening name_en_text/provenance over a row missing both", async () => {
    for (const city of REAL_SEEDED_CITIES) {
      await insertLegacyCity(city.id, city.nameUk, city.nameEn);
    }
    // One real row regresses to no English name at all — the exact gap the
    // tightening exists to catch before it ever reaches ALTER COLUMN.
    await client`UPDATE cities SET name_en_text = NULL, name_en_provenance = NULL WHERE id = ${REAL_SEEDED_CITIES[0].id}`;

    await expect(applyMigration(BACKFILL_TAG)).rejects.toThrow(
      /name_en_text\/name_en_provenance tightening is unsafe/,
    );
  });

  /**
   * Reviewer found, 2026-09-12: the test above only exercises the guard's
   * `OR` with *both* sides true (`text IS NULL OR provenance IS NULL`, both
   * null at once) — the actual reason the two columns were tightened
   * *together* (`packages/db/src/schema/cities.ts`'s own comment) is a row
   * where only one is missing, which this covers and the other test does
   * not.
   */
  it("aborts rather than tightening name_en_text/provenance over a row missing only one", async () => {
    for (const city of REAL_SEEDED_CITIES) {
      await insertLegacyCity(city.id, city.nameUk, city.nameEn);
    }
    // A real English string survives, but its own provenance doesn't — the
    // exact half-null shape `columnsToLocalizedText` (historically) and
    // `rowToCity` (today, directly) both treat as "no English name at all."
    await client`UPDATE cities SET name_en_provenance = NULL WHERE id = ${REAL_SEEDED_CITIES[0].id}`;

    await expect(applyMigration(BACKFILL_TAG)).rejects.toThrow(
      /name_en_text\/name_en_provenance tightening is unsafe/,
    );
  });

  /**
   * Reviewer found, 2026-09-12: every other test here only proves the
   * tightening's own *abort path* — nothing proved the `NOT NULL`
   * constraint the migration is supposed to leave behind actually exists
   * afterward. Deleting both `ALTER COLUMN ... SET NOT NULL` statements
   * left every other test in this file green; this is the one that would
   * have caught it. Symmetric to "the unique constraint is real" below,
   * same reasoning, applied to the other guarantee this migration adds.
   */
  it("the NOT NULL constraint is real — neither column accepts a null after the migration", async () => {
    for (const city of REAL_SEEDED_CITIES) {
      await insertLegacyCity(city.id, city.nameUk, city.nameEn);
    }
    await applyMigration(BACKFILL_TAG);

    await expect(
      client`UPDATE cities SET name_en_text = NULL WHERE id = ${REAL_SEEDED_CITIES[0].id}`,
    ).rejects.toThrow();
    await expect(
      client`UPDATE cities SET name_en_provenance = NULL WHERE id = ${REAL_SEEDED_CITIES[0].id}`,
    ).rejects.toThrow();
  });

  it("the unique constraint is real — two rows can't share a slug after the migration", async () => {
    for (const city of REAL_SEEDED_CITIES) {
      await insertLegacyCity(city.id, city.nameUk, city.nameEn);
    }
    await applyMigration(BACKFILL_TAG);

    await expect(
      client`UPDATE cities SET slug = 'kyiv' WHERE id = ${REAL_SEEDED_CITIES[1].id}`,
    ).rejects.toThrow();
  });
});
