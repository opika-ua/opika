import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShelterVerification, VerificationStatus } from "@opika/domain";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import * as schema from "../src/schema/index";
import { makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Migration 0033 (owner, 2026-11-24): `shelters.premises`, its three CHECKs, the backfill from
 * `exact_address`, and `shelters_verified_has_verified_data` asking for premises instead of the
 * address. Rows are written with raw SQL where a CHECK is the subject.
 */

const MIGRATIONS_DIR = resolve(fileURLToPath(import.meta.url), "../../drizzle");
const TAG = "0033_shelter_premises";

const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: new Date("2026-11-01T00:00:00.000Z"),
  evidence: { items: [], submittedAt: new Date("2026-11-01T00:00:00.000Z") },
};
const INITIATIVE = JSON.stringify({
  kind: "unregistered_initiative",
  contactPersonName: "Олена",
});

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

/** A shelter at an address (the fixture), with its status set in place. */
async function seedShelter(status: VerificationStatus = "pending") {
  const city = makeCity();
  await cityRepo(db).insertMissing([city]);
  const shelter = makeShelter({
    publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    verification: PENDING,
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

/** Makes a seeded shelter an initiative in foster homes: no address, no point. */
const toFosterInitiative = (id: string) =>
  client`UPDATE shelters SET legal_entity = ${INITIATIVE}::jsonb, premises = 'foster_homes', exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${id}`;

describe("0033 shelter premises: the migration", () => {
  it("backfills premises from the address before its CHECKs, touching no row without one", async () => {
    await resetTo(TAG);
    const city = makeCity();
    await cityRepo(db).insertMissing([city]);
    // Three rows as 0032 left them: verified with an address, pending with none, pending with
    // an address but no legal entity.
    await client.unsafe("ALTER TABLE shelters ADD COLUMN IF NOT EXISTS premises text");
    const withAddress = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
      verification: PENDING,
    });
    const without = makeShelter({
      publicLocation: { precision: "city", cityId: city.id, district: null },
      verification: PENDING,
    });
    const noForm = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
      verification: PENDING,
    });
    for (const shelter of [withAddress, without, noForm]) await shelterRepo(db).insert(shelter);
    // Back to 0032's shape: the column comes from the migration, never from the repo.
    await client.unsafe("ALTER TABLE shelters DROP COLUMN premises");
    await client`UPDATE shelters SET verification_status = 'verified' WHERE id = ${withAddress.id}`;
    await client`UPDATE shelters SET exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${without.id}`;
    await client`UPDATE shelters SET legal_entity = NULL WHERE id = ${noForm.id}`;

    await applyMigration(TAG);

    const rows = await client`SELECT id, premises FROM shelters ORDER BY id`;
    const premisesOf = (id: string) => rows.find((row) => row.id === id)?.premises ?? null;
    expect([premisesOf(withAddress.id), premisesOf(without.id), premisesOf(noForm.id)]).toEqual([
      "address",
      null,
      "address",
    ]);
    const checks = await client`
      SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid = 'shelters'::regclass AND contype = 'c' AND conname IN (
        'shelters_foster_homes_initiative_only', 'shelters_premises_address_check',
        'shelters_premises_check', 'shelters_verified_has_verified_data')
      ORDER BY conname`;
    expect(checks.map((row) => String(row.conname))).toEqual([
      "shelters_foster_homes_initiative_only",
      "shelters_premises_address_check",
      "shelters_premises_check",
      "shelters_verified_has_verified_data",
    ]);
    const verified = checks.find((row) => row.conname === "shelters_verified_has_verified_data");
    expect(String(verified?.definition)).toContain("premises IS NOT NULL");
    expect(String(verified?.definition)).not.toContain("exact_address");
    // The repo reads the backfilled row as an address.
    expect((await shelterRepo(db).findById(withAddress.id))?.premises).toEqual(
      withAddress.premises,
    );
    expect((await shelterRepo(db).findById(without.id))?.premises).toEqual({
      kind: "not_recorded",
    });
  });
});

describe("0033 shelter premises: what the database accepts", () => {
  beforeEach(async () => {
    await resetTo(null);
  });

  describe("shelters_premises_check", () => {
    it.each(["address", null])("accepts %s", async (value) => {
      const shelter = await seedShelter();
      const assignment =
        value === null
          ? client`UPDATE shelters SET premises = NULL, exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`
          : client`UPDATE shelters SET premises = ${value} WHERE id = ${shelter.id}`;
      expect(await outcomeOf(assignment)).toBe("accepted");
    });

    it("refuses any other value, not_recorded included (that is NULL)", async () => {
      const shelter = await seedShelter();
      for (const value of ["not_recorded", "Address", ""]) {
        expect(
          await outcomeOf(client`UPDATE shelters SET premises = ${value} WHERE id = ${shelter.id}`),
        ).toBe("shelters_premises_check");
      }
    });
  });

  describe("shelters_premises_address_check", () => {
    it("accepts an address with premises at it, and neither", async () => {
      const shelter = await seedShelter();
      expect(
        await outcomeOf(client`UPDATE shelters SET premises = 'address' WHERE id = ${shelter.id}`),
      ).toBe("accepted");
      expect(
        await outcomeOf(
          client`UPDATE shelters SET premises = NULL, exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`,
        ),
      ).toBe("accepted");
    });

    it("refuses an address with premises not recorded", async () => {
      const shelter = await seedShelter();
      expect(
        await outcomeOf(client`UPDATE shelters SET premises = NULL WHERE id = ${shelter.id}`),
      ).toBe("shelters_premises_address_check");
    });

    it("refuses premises at an address with no address", async () => {
      const shelter = await seedShelter();
      expect(
        await outcomeOf(
          client`UPDATE shelters SET exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`,
        ),
      ).toBe("shelters_premises_address_check");
    });

    it("refuses foster homes that keep an address: no foster carer's address is stored", async () => {
      const shelter = await seedShelter();
      expect(
        await outcomeOf(
          client`UPDATE shelters SET legal_entity = ${INITIATIVE}::jsonb, premises = 'foster_homes' WHERE id = ${shelter.id}`,
        ),
      ).toBe("shelters_premises_address_check");
    });
  });

  describe("shelters_foster_homes_initiative_only", () => {
    it("accepts foster homes for an initiative", async () => {
      const shelter = await seedShelter();
      expect(await outcomeOf(toFosterInitiative(shelter.id))).toBe("accepted");
    });

    it("refuses foster homes for a registered organisation", async () => {
      const shelter = await seedShelter();
      expect(
        await outcomeOf(
          client`UPDATE shelters SET premises = 'foster_homes', exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`,
        ),
      ).toBe("shelters_foster_homes_initiative_only");
    });

    it("refuses foster homes with no form picked", async () => {
      const shelter = await seedShelter();
      expect(
        await outcomeOf(
          client`UPDATE shelters SET legal_entity = NULL, premises = 'foster_homes', exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`,
        ),
      ).toBe("shelters_foster_homes_initiative_only");
    });

    it("refuses leaving the initiative form while in foster homes (D5)", async () => {
      const shelter = await seedShelter();
      await toFosterInitiative(shelter.id);
      expect(
        await outcomeOf(
          client`UPDATE shelters SET legal_entity = ${JSON.stringify(shelter.legalEntity)}::jsonb WHERE id = ${shelter.id}`,
        ),
      ).toBe("shelters_foster_homes_initiative_only");
    });
  });

  describe("shelters_verified_has_verified_data, replaced", () => {
    it.each(["verified", "paused", "suspended"] as const)(
      "%s: accepts a form with premises of either kind, refuses no form or no premises",
      async (status) => {
        const atAddress = await seedShelter(status);
        expect(
          await outcomeOf(
            client`UPDATE shelters SET legal_entity = NULL WHERE id = ${atAddress.id}`,
          ),
        ).toBe("shelters_verified_has_verified_data");
        expect(
          await outcomeOf(
            client`UPDATE shelters SET premises = NULL, exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${atAddress.id}`,
          ),
        ).toBe("shelters_verified_has_verified_data");
        const fostered = await seedShelter(status);
        expect(await outcomeOf(toFosterInitiative(fostered.id))).toBe("accepted");
      },
    );

    it.each(["pending", "under_review", "rejected"] as const)(
      "%s: accepts no form and no premises, and refuses approving it in place",
      async (status) => {
        const shelter = await seedShelter(status);
        expect(
          await outcomeOf(
            client`UPDATE shelters SET legal_entity = NULL, premises = NULL, exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${shelter.id}`,
          ),
        ).toBe("accepted");
        expect(
          await outcomeOf(
            client`UPDATE shelters SET verification_status = 'verified' WHERE id = ${shelter.id}`,
          ),
        ).toBe("shelters_verified_has_verified_data");
      },
    );
  });

  it("reads foster homes back as foster homes, with no address", async () => {
    const shelter = await seedShelter();
    await toFosterInitiative(shelter.id);
    expect((await shelterRepo(db).findById(shelter.id))?.premises).toEqual({
      kind: "foster_homes",
    });
  });
});
