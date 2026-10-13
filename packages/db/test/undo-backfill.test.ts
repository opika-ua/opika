import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import * as schema from "../src/schema/index";
import { makeCity, setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";
import { insertLegacyAnimal, insertLegacyShelter } from "./legacy-rows";

/**
 * Migration 0008 (H2 S3): `shelters.version`, and `"undoable": null` on every
 * published/reserved listing. Tested against rows in their pre-0008 shape, as
 * the other backfill tests are. The failure aimed at: a backfill that misses
 * reserved rows (the domain then reads `undoable` as undefined on exactly the
 * listings «Ще домовляються» confirms), or that stamps the key onto drafts.
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const TAG = "0008_eager_rocket_racer";

const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
const db = drizzle(client, { schema });

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

async function resetToPreMigrationState(): Promise<void> {
  await client.unsafe(`
    DROP TABLE IF EXISTS shelter_history CASCADE;
    DROP TABLE IF EXISTS super_admins CASCADE;
    DROP TABLE IF EXISTS auth_invitation CASCADE;
    DROP TABLE IF EXISTS auth_member CASCADE;
    DROP TABLE IF EXISTS auth_session CASCADE;
    DROP TABLE IF EXISTS auth_account CASCADE;
    DROP TABLE IF EXISTS auth_verification CASCADE;
    DROP TABLE IF EXISTS auth_organization CASCADE;
    DROP TABLE IF EXISTS auth_user CASCADE;
    DROP TABLE IF EXISTS sessions CASCADE; DROP TABLE IF EXISTS reveals CASCADE;
    DROP TABLE IF EXISTS swipes CASCADE; DROP TABLE IF EXISTS animals CASCADE;
    DROP TABLE IF EXISTS adopters CASCADE; DROP TABLE IF EXISTS shelters CASCADE;
    DROP TABLE IF EXISTS cities CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);
  const journal = JSON.parse(
    await readFile(resolve(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  const tags = journal.entries.map((e) => e.tag);
  const index = tags.indexOf(TAG);
  expect(index, `${TAG} is not in the migration journal`).toBeGreaterThan(-1);
  for (const tag of tags.slice(0, index)) await applyMigration(tag);
}

const AT = "2026-06-01T12:00:00.000Z";
const SHELTER = "51000000-0000-4000-8000-000000000001";
const aid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function seedShelter(): Promise<string> {
  const city = makeCity();
  await cityRepo(db).insert(city);
  await insertLegacyShelter(client, { id: SHELTER, cityId: city.id });
  return city.id;
}

describe("0008 undoable + shelters.version", () => {
  beforeEach(async () => {
    await resetToPreMigrationState();
  });

  it("gives every published and reserved listing undoable: null, and nothing else", async () => {
    const cityId = await seedShelter();
    const rows = [
      {
        id: aid(1),
        listingKind: "published",
        listing: { kind: "published", publishedAt: AT, confirmedAt: AT },
      },
      {
        id: aid(2),
        listingKind: "reserved",
        listing: { kind: "reserved", since: AT, publishedAt: AT, confirmedAt: AT },
      },
      { id: aid(3), listingKind: "draft", listing: { kind: "draft" } },
      { id: aid(4), listingKind: "adopted", listing: { kind: "adopted", adoptedAt: AT } },
    ];
    for (const row of rows)
      await insertLegacyAnimal(client, { ...row, shelterId: SHELTER, cityId });

    await applyMigration(TAG);

    const result = (await client`
      SELECT id, listing ? 'undoable' AS has_key, jsonb_typeof(listing->'undoable') AS t
      FROM animals ORDER BY id`) as unknown as { id: string; has_key: boolean; t: string | null }[];
    expect(result).toEqual([
      { id: aid(1), has_key: true, t: "null" },
      { id: aid(2), has_key: true, t: "null" },
      { id: aid(3), has_key: false, t: null },
      { id: aid(4), has_key: false, t: null },
    ]);
  });

  it("adds shelters.version, starting at 0", async () => {
    await seedShelter();
    await applyMigration(TAG);
    const [row] = (await client`SELECT version FROM shelters`) as unknown as { version: number }[];
    expect(row?.version).toBe(0);
  });

  it("leaves a listing that already carries undoable exactly as it is", async () => {
    const cityId = await seedShelter();
    const undoable = { previousConfirmedAt: "2026-05-01T12:00:00.000Z", confirmedAt: AT };
    await insertLegacyAnimal(client, {
      id: aid(1),
      shelterId: SHELTER,
      cityId,
      listingKind: "published",
      listing: { kind: "published", publishedAt: AT, confirmedAt: AT, undoable },
    });
    await applyMigration(TAG);
    const [row] = (await client`SELECT listing->'undoable' AS u FROM animals`) as unknown as {
      u: unknown;
    }[];
    expect(row?.u).toEqual(undoable);
  });

  it("aborts on a draft carrying an undo it can't have", async () => {
    const cityId = await seedShelter();
    await insertLegacyAnimal(client, {
      id: aid(1),
      shelterId: SHELTER,
      cityId,
      listingKind: "draft",
      listing: { kind: "draft", undoable: null },
    });
    await expect(applyMigration(TAG)).rejects.toThrow(/1 non-visible listings carrying it/);
  });
});
