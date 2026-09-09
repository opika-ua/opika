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
 * against for real, not a synthetic stand-in. */
const REAL_SEEDED_CITIES = [
  { id: "c1000000-0000-4000-8000-000000000000", nameUk: "Київ" },
  { id: "c1000000-0000-4000-8000-000000000001", nameUk: "Бровари" },
  { id: "c1000000-0000-4000-8000-000000000002", nameUk: "Ірпінь" },
  { id: "c1000000-0000-4000-8000-000000000003", nameUk: "Буча" },
  { id: "c1000000-0000-4000-8000-000000000004", nameUk: "Вишгород" },
  { id: "c1000000-0000-4000-8000-000000000005", nameUk: "Бориспіль" },
  { id: "c1000000-0000-4000-8000-000000000006", nameUk: "Фастів" },
  { id: "c1000000-0000-4000-8000-000000000007", nameUk: "Біла Церква" },
] as const;

async function insertLegacyCity(id: string, nameUk: string): Promise<void> {
  await client`
    INSERT INTO cities (id, name_uk, centroid_lat, centroid_lng)
    VALUES (${id}, ${nameUk}, ${50.45}, ${30.52})`;
}

type SlugRow = { readonly id: string; readonly slug: string };

async function slugRows(): Promise<readonly SlugRow[]> {
  return (await client`SELECT id, slug FROM cities ORDER BY id`) as unknown as readonly SlugRow[];
}

describe("0005 cities.slug backfill", () => {
  beforeEach(async () => {
    await resetToPreSlugState();
  });

  it("backfills every one of the real seeded cities to the slug citySlugOf produces", async () => {
    for (const city of REAL_SEEDED_CITIES) {
      await insertLegacyCity(city.id, city.nameUk);
    }

    await applyMigration(BACKFILL_TAG);

    const rows = await slugRows();
    expect(rows).toHaveLength(REAL_SEEDED_CITIES.length);
    const bySlugId = new Map(rows.map((row) => [row.id, row.slug]));
    for (const city of REAL_SEEDED_CITIES) {
      expect(bySlugId.get(city.id), `slug for ${city.nameUk}`).toBe(citySlugOf(city.nameUk));
    }
  });

  it("backfills correctly even when the table holds only a subset of the 8 — order and completeness aren't assumed", async () => {
    const subset = [REAL_SEEDED_CITIES[3], REAL_SEEDED_CITIES[0], REAL_SEEDED_CITIES[6]];
    for (const city of subset) {
      // biome-ignore lint/style/noNonNullAssertion: subset is a fixed literal of 3 real entries
      await insertLegacyCity(city!.id, city!.nameUk);
    }

    await applyMigration(BACKFILL_TAG);

    const rows = await slugRows();
    expect(rows).toHaveLength(subset.length);
    for (const row of rows) {
      const expected = subset.find((c) => c?.id === row.id);
      expect(row.slug).toBe(citySlugOf(expected?.nameUk ?? ""));
    }
  });

  it("aborts rather than silently leaving a NULL slug on a city id it doesn't recognise", async () => {
    // A row this migration's hardcoded CASE has never seen — real onboarding
    // (H2) already having added a city, or a database seeded from something
    // other than this repo's own seed.ts. Constructed with a real-shaped
    // UUID that provably isn't one of the 8 known ids.
    await insertLegacyCity("99999999-0000-4000-8000-000000000000", "Невідоме Місто");

    await expect(applyMigration(BACKFILL_TAG)).rejects.toThrow(/backfill is incomplete/);
  });

  it("the unique constraint is real — two rows can't share a slug after the migration", async () => {
    for (const city of REAL_SEEDED_CITIES) {
      await insertLegacyCity(city.id, city.nameUk);
    }
    await applyMigration(BACKFILL_TAG);

    await expect(
      client`UPDATE cities SET slug = 'kyiv' WHERE id = ${REAL_SEEDED_CITIES[1].id}`,
    ).rejects.toThrow();
  });
});
