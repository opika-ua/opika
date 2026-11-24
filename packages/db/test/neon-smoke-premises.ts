import { randomUUID } from "node:crypto";
import type { CityId, ShelterVerification } from "@opika/domain";
import { and, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { executeRows } from "../src/raw-rows";
import { cityRepo } from "../src/repos/city-repo";
import { shelterToRow } from "../src/repos/mappers";
import { shelterRepo } from "../src/repos/shelter-repo";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter } from "../src/test-utils/index";
import { outcomeOf } from "./neon-smoke-verified-data";

type Outcome = { name: string; ok: boolean; detail: string };

const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: new Date("2026-11-24T00:00:00.000Z"),
  evidence: { items: [], submittedAt: new Date("2026-11-24T00:00:00.000Z") },
};

const NEW_CHECKS = [
  "shelters_foster_homes_initiative_only",
  "shelters_premises_address_check",
  "shelters_premises_check",
] as const;

/**
 * Migration 0033 on Neon's driver: the `premises` column and its CHECKs, the backfill (no address
 * without premises), and foster homes accepted for an initiative and refused for an organisation.
 * Rows stay on the child branch, which is thrown away.
 */
export async function runPremisesSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const [column] = await executeRows<{ type: string; nullable: string }>(
    db,
    sql`SELECT data_type AS type, is_nullable AS nullable FROM information_schema.columns
        WHERE table_name = 'shelters' AND column_name = 'premises'`,
  );
  check(
    "0033: shelters.premises is a nullable text column",
    column?.type === "text" && column.nullable === "YES",
    column === undefined ? "missing" : `${column.type}, nullable ${column.nullable}`,
  );

  const constraints = await executeRows<{ name: string; definition: string }>(
    db,
    sql`SELECT conname AS name, pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conrelid = 'shelters'::regclass AND conname IN (
          'shelters_foster_homes_initiative_only', 'shelters_premises_address_check',
          'shelters_premises_check', 'shelters_verified_has_verified_data')
        ORDER BY conname`,
  );
  const names = constraints.map((row) => row.name);
  check(
    "0033: the three premises CHECKs exist",
    NEW_CHECKS.every((name) => names.includes(name)),
    names.join(", ") || "none",
  );
  const verified = constraints.find((row) => row.name === "shelters_verified_has_verified_data");
  check(
    "0033: shelters_verified_has_verified_data asks for premises, no longer the address",
    verified !== undefined &&
      /premises IS NOT NULL/.test(verified.definition) &&
      !/exact_address/.test(verified.definition),
    verified?.definition ?? "missing",
  );

  // Counted with the query builder, never a raw read: the same shape on both drivers.
  const [unbackfilled] = await db
    .select({ n: count() })
    .from(shelters)
    .where(and(isNotNull(shelters.exactAddress), isNull(shelters.premises)));
  check(
    "0033: the backfill left no shelter with an address but no premises",
    unbackfilled?.n === 0,
    `${unbackfilled?.n ?? "?"} row(s)`,
  );

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const initiative = makeShelter({
    displayName: `Смоук перетримки ${city.id.slice(0, 6)}`,
    publicLocation: { precision: "city", cityId: city.id, district: null },
    verification: PENDING,
  });
  const fosterInsert = await outcomeOf(async () => {
    await db.insert(shelters).values({
      ...shelterToRow(initiative),
      legalEntity: { kind: "unregistered_initiative", contactPersonName: "Олена" },
      premises: "foster_homes",
      exactAddress: null,
      exactLat: null,
      exactLng: null,
    });
  });
  const stored = await shelterRepo(db).findById(initiative.id);
  check(
    "0033: an initiative in foster homes is accepted and reads back with no address",
    fosterInsert === "accepted" && stored?.premises.kind === "foster_homes",
    `${fosterInsert}, read back ${stored?.premises.kind ?? "missing"}`,
  );

  const organisation = makeShelter({
    displayName: `Смоук організація ${city.id.slice(0, 6)}`,
    publicLocation: { precision: "city", cityId: city.id, district: null },
    verification: PENDING,
  });
  await shelterRepo(db).insert(organisation);
  const orgFoster = await outcomeOf(async () => {
    await db.execute(
      sql`UPDATE shelters SET premises = 'foster_homes', exact_address = NULL, exact_lat = NULL, exact_lng = NULL WHERE id = ${organisation.id}`,
    );
  });
  check(
    "0033: an organisation in foster homes is refused by shelters_foster_homes_initiative_only",
    orgFoster === "shelters_foster_homes_initiative_only",
    orgFoster,
  );

  const unchanged = await db
    .select({ premises: shelters.premises })
    .from(shelters)
    .where(eq(shelters.id, organisation.id));
  check(
    "0033: the refused organisation keeps its address premises",
    unchanged[0]?.premises === "address",
    `${unchanged[0]?.premises ?? "missing"}`,
  );

  return out;
}
