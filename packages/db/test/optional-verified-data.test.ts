import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShelterVerification, VerificationStatus } from "@opika/domain";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { shelterToRow } from "../src/repos/mappers";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Migration 0024: the legal entity, the address and its point may be null (minimal create), held by
 * three CHECKs. The app still never writes null; these tests write it directly.
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const TAG = "0024_optional_verified_data";
const CONSTRAINTS = [
  "shelters_exact_point_all_or_none",
  "shelters_exact_point_needs_address",
  "shelters_verified_has_verified_data",
];

/** No legal entity or address is allowed only before approval. */
const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: new Date("2026-11-01T00:00:00.000Z"),
  evidence: { items: [], submittedAt: new Date("2026-11-01T00:00:00.000Z") },
};

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

async function seedShelter(status: VerificationStatus = "pending") {
  const city = makeCity();
  await cityRepo(db).insertMissing([city]);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
  });
  await shelterRepo(db).insert(shelter);
  await client`UPDATE shelters SET verification_status = ${status} WHERE id = ${shelter.id}`;
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

describe("0024 optional verified data: the migration", () => {
  it("keeps an existing full row, loosens the four columns and adds the three CHECKs", async () => {
    await resetTo(TAG);
    // The repo insert names a later column (0025); added here so a fixture row can be written.
    await client.unsafe(
      "ALTER TABLE shelters ADD COLUMN IF NOT EXISTS freshness_reminder_off_at timestamptz",
    );
    const shelter = await seedShelter("verified");
    await applyMigration(TAG);

    expect((await shelterRepo(db).findById(shelter.id))?.legalEntity).toEqual(shelter.legalEntity);
    const nullable = await client`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'shelters'
        AND column_name IN ('legal_entity', 'exact_address', 'exact_lat', 'exact_lng')
      ORDER BY column_name`;
    expect(nullable.map((r) => `${r.column_name} ${r.is_nullable}`)).toEqual([
      "exact_address YES",
      "exact_lat YES",
      "exact_lng YES",
      "legal_entity YES",
    ]);
    const checks = await client`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'shelters'::regclass AND contype = 'c' ORDER BY conname`;
    expect(checks.map((r) => String(r.conname))).toEqual(CONSTRAINTS);
  });
});

describe("0024 optional verified data: what the database accepts", () => {
  beforeEach(async () => {
    await resetTo(null);
  });

  it("inserts a pending shelter with all four columns null", async () => {
    const city = makeCity();
    await cityRepo(db).insertMissing([city]);
    const shelter = makeShelter({
      publicLocation: { precision: "city", cityId: city.id, district: null },
      verification: PENDING,
    });
    await db.insert(shelters).values({
      ...shelterToRow(shelter),
      legalEntity: null,
      exactAddress: null,
      exactLat: null,
      exactLng: null,
    });
    const [row] = await db.select().from(shelters).where(eq(shelters.id, shelter.id));
    expect([row?.legalEntity, row?.exactAddress, row?.exactLat, row?.exactLng]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it.each([
    ["legal entity alone", "legal_entity = NULL"],
    ["address with its point", "exact_address = NULL, exact_lat = NULL, exact_lng = NULL"],
    ["the point alone (address kept)", "exact_lat = NULL, exact_lng = NULL"],
  ])("accepts null for the %s on a pending shelter", async (_name, assignments) => {
    const shelter = await seedShelter("pending");
    expect(
      await outcomeOf(
        client.unsafe(`UPDATE shelters SET ${assignments} WHERE id = $1`, [shelter.id]),
      ),
    ).toBe("accepted");
  });

  it("refuses a latitude without a longitude, and the reverse", async () => {
    const shelter = await seedShelter();
    for (const column of ["exact_lat", "exact_lng"]) {
      expect(
        await outcomeOf(
          client.unsafe(`UPDATE shelters SET ${column} = NULL WHERE id = $1`, [shelter.id]),
        ),
      ).toBe("shelters_exact_point_all_or_none");
    }
  });

  it("refuses a point without an address", async () => {
    const shelter = await seedShelter();
    expect(
      await outcomeOf(client`UPDATE shelters SET exact_address = NULL WHERE id = ${shelter.id}`),
    ).toBe("shelters_exact_point_needs_address");
  });

  it.each(["verified", "paused", "suspended"] as const)(
    "refuses a %s shelter without its legal entity or address",
    async (status) => {
      const shelter = await seedShelter(status);
      expect(
        await outcomeOf(client`UPDATE shelters SET legal_entity = NULL WHERE id = ${shelter.id}`),
      ).toBe("shelters_verified_has_verified_data");
      expect(
        await outcomeOf(
          client`UPDATE shelters SET exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`,
        ),
      ).toBe("shelters_verified_has_verified_data");
    },
  );

  it.each(["pending", "under_review", "rejected"] as const)(
    "accepts a %s shelter with both missing, and refuses approving it in place",
    async (status) => {
      const shelter = await seedShelter(status);
      expect(
        await outcomeOf(
          client`UPDATE shelters SET legal_entity = NULL, exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`,
        ),
      ).toBe("accepted");
      expect(
        await outcomeOf(
          client`UPDATE shelters SET verification_status = 'verified' WHERE id = ${shelter.id}`,
        ),
      ).toBe("shelters_verified_has_verified_data");
    },
  );

  it("a read of a null row maps both fields to null", async () => {
    const shelter = await seedShelter();
    await client`UPDATE shelters SET legal_entity = NULL, exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`;
    const read = await shelterRepo(db).findById(shelter.id);
    expect([read?.legalEntity, read?.exactAddress]).toEqual([null, null]);
  });

  it("writes no point for an address without coordinates", async () => {
    const city = makeCity();
    await cityRepo(db).insertMissing([city]);
    const base = makeShelter({ verification: PENDING });
    const shelter = {
      ...base,
      exactAddress: { ...base.exactAddress, cityId: city.id, coordinates: null },
      publicLocation: { precision: "city" as const, cityId: city.id, district: null },
    };
    await db.insert(shelters).values(shelterToRow(shelter));
    const [row] = await db.select().from(shelters).where(eq(shelters.id, shelter.id));
    expect([row?.exactLat, row?.exactLng]).toEqual([null, null]);
  });
});
