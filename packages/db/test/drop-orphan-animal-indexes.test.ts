import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Migration 0021 drops the two indexes the gallery filter restructure orphaned. The full expected
 * list is asserted, so a later accidental drop of a feed index fails here too.
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const TAG = "0021_drop_orphan_animal_indexes";
const DROPPED = ["animals_coat_colour_idx", "animals_temperament_traits_idx"];

const EXPECTED_ANIMAL_INDEXES = [
  "animals_feed_idx",
  "animals_feed_unfiltered_idx",
  "animals_pkey",
  "animals_shelter_id_idx",
  "animals_wait_anchor_filtered_idx",
  "animals_wait_anchor_idx",
];

const client = postgres(TEST_DATABASE_URL, { max: 1 });

beforeAll(async () => {
  await (await setupTestDatabase()).cleanup();
});

afterAll(async () => {
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

async function resetTo(stopBefore: string | null): Promise<void> {
  await client.unsafe(
    "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
  );
  const tags = await migrationTags();
  const end = stopBefore === null ? tags.length : tags.indexOf(stopBefore);
  expect(end, `${stopBefore} is not in the migration journal`).toBeGreaterThan(-1);
  for (const tag of tags.slice(0, end)) await applyMigration(tag);
}

async function animalIndexes(): Promise<string[]> {
  const rows = await client.unsafe(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'animals' ORDER BY indexname",
  );
  return rows.map((r) => String(r.indexname));
}

describe("0021 drop orphan animal indexes", () => {
  beforeEach(async () => {
    await resetTo(TAG);
  });

  it("has both indexes before the migration", async () => {
    expect(await animalIndexes()).toEqual(expect.arrayContaining(DROPPED));
  });

  it("drops exactly the two, keeps every other index, and keeps existing rows", async () => {
    // The schema's columns are identical before and after 0021, so the repos write a real row
    // into the previous-migration database.
    // Later column (0023) that the repo insert names; added here so a fixture row can be written.
    await client.unsafe(
      "ALTER TABLE shelters ADD COLUMN IF NOT EXISTS early_listing_since timestamptz",
    );
    const db = drizzle(client, { schema });
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    await animalRepo(db).insert(makeAnimal({ shelterId: shelter.id }), city.id);
    const before = await client.unsafe("SELECT count(*)::int AS n FROM animals");
    expect(before[0]?.n).toBe(1);
    await applyMigration(TAG);
    expect(await animalIndexes()).toEqual(EXPECTED_ANIMAL_INDEXES);
    const after = await client.unsafe("SELECT count(*)::int AS n FROM animals");
    expect(after[0]?.n).toBe(before[0]?.n);
  });

  it("is idempotent (IF EXISTS) and applies on a fresh database", async () => {
    await applyMigration(TAG);
    await applyMigration(TAG);
    await resetTo(null);
    expect(await animalIndexes()).toEqual(EXPECTED_ANIMAL_INDEXES);
  });
});
