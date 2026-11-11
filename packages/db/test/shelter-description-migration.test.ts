import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Migration 0026: the shelter description may be null (the shelter wrote none), and English is
 * never stored without the Ukrainian it translates (`shelters_description_en_check`).
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const TAG = "0026_shelter_description_nullable";
const CHECK = "shelters_description_en_check";

const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

beforeAll(async () => {
  await (await setupTestDatabase()).cleanup();
});

afterAll(async () => {
  await (await setupTestDatabase()).cleanup();
  await client.end();
});

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
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { readonly entries: readonly { readonly tag: string }[] };
  const tags = journal.entries.map((entry) => entry.tag);
  const end = stopBefore === null ? tags.length : tags.indexOf(stopBefore);
  expect(end, `${stopBefore} is not in the migration journal`).toBeGreaterThan(-1);
  for (const tag of tags.slice(0, end)) await applyMigration(tag);
}

async function seedShelter() {
  const city = makeCity();
  await cityRepo(db).insertMissing([city]);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  return shelter;
}

/** The constraint that refused `statement`, or "accepted". */
async function outcomeOf(statement: Promise<unknown>): Promise<string> {
  try {
    await statement;
    return "accepted";
  } catch (error) {
    const pg = error as { code?: string; constraint_name?: string };
    return pg.code === "23514" ? (pg.constraint_name ?? "23514") : `error ${pg.code}`;
  }
}

describe("0026 shelter description nullable: the migration", () => {
  it("keeps every existing row, makes description_uk nullable and adds the CHECK", async () => {
    await resetTo(TAG);
    const before = await client`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'shelters' AND column_name = 'description_uk'`;
    expect(before[0]?.is_nullable).toBe("NO");
    const shelter = await seedShelter();
    await applyMigration(TAG);

    expect((await shelterRepo(db).findById(shelter.id))?.description).toEqual(shelter.description);
    const after = await client`
      SELECT is_nullable FROM information_schema.columns
      WHERE table_name = 'shelters' AND column_name = 'description_uk'`;
    expect(after[0]?.is_nullable).toBe("YES");
    const checks = await client`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'shelters'::regclass AND conname = ${CHECK}`;
    expect(checks).toHaveLength(1);
  });
});

describe("0026 shelter description nullable: what the database accepts", () => {
  it("stores a shelter with no description, and refuses English without Ukrainian", async () => {
    await resetTo(null);
    const shelter = await seedShelter();
    expect(
      await outcomeOf(
        client`UPDATE shelters SET description_uk = NULL, description_en_text = NULL, description_en_provenance = NULL WHERE id = ${shelter.id}`,
      ),
    ).toBe("accepted");
    expect((await shelterRepo(db).findById(shelter.id))?.description).toBeNull();

    for (const assignment of [
      client`UPDATE shelters SET description_en_text = 'Text', description_en_provenance = 'human' WHERE id = ${shelter.id}`,
      client`UPDATE shelters SET description_en_text = 'Text' WHERE id = ${shelter.id}`,
      client`UPDATE shelters SET description_en_provenance = 'human' WHERE id = ${shelter.id}`,
    ]) {
      expect(await outcomeOf(assignment)).toBe(CHECK);
    }
  });

  it("accepts English beside Ukrainian, and a Ukrainian-only description", async () => {
    await resetTo(null);
    const shelter = await seedShelter();
    expect(
      await outcomeOf(
        client`UPDATE shelters SET description_uk = 'Опис', description_en_text = 'Text', description_en_provenance = 'human' WHERE id = ${shelter.id}`,
      ),
    ).toBe("accepted");
    expect(
      await outcomeOf(
        client`UPDATE shelters SET description_en_text = NULL, description_en_provenance = NULL WHERE id = ${shelter.id}`,
      ),
    ).toBe("accepted");
  });

  it("stores a description over 1,500 characters: only input is capped", async () => {
    await resetTo(null);
    const shelter = await seedShelter();
    const long = "я".repeat(1737);
    await client`UPDATE shelters SET description_uk = ${long} WHERE id = ${shelter.id}`;
    expect((await shelterRepo(db).findById(shelter.id))?.description?.uk).toBe(long);
  });
});
