import { randomUUID } from "node:crypto";
import type { CityId, ShelterVerification } from "@opika/domain";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../src/client";
import { cityRepo } from "../src/repos/city-repo";
import { shelterToRow } from "../src/repos/mappers";
import { shelterRepo } from "../src/repos/shelter-repo";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter } from "../src/test-utils/index";

type Outcome = { name: string; ok: boolean; detail: string };

/** No legal entity or address is allowed only before approval. */
const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: new Date("2026-11-01T00:00:00.000Z"),
  evidence: { items: [], submittedAt: new Date("2026-11-01T00:00:00.000Z") },
};

/** The SQLSTATE and constraint name from the error chain (Drizzle wraps the driver's error). */
function refusalOf(error: unknown): string {
  for (
    let e: unknown = error;
    e !== null && typeof e === "object";
    e = (e as { cause?: unknown }).cause
  ) {
    const pg = e as { code?: unknown; constraint?: unknown; constraint_name?: unknown };
    if (pg.code === "23514") return String(pg.constraint ?? pg.constraint_name ?? "23514");
    if (typeof pg.code === "string") return `error ${pg.code}`;
  }
  return "error";
}

async function outcomeOf(statement: Promise<unknown>): Promise<string> {
  try {
    await statement;
    return "accepted";
  } catch (error) {
    return refusalOf(error);
  }
}

/**
 * Migration 0024 on Neon's driver: a pending shelter may lack its legal entity, address and point,
 * and the three CHECKs refuse the rest. Rows stay on the child branch, which is thrown away.
 */
export async function runVerifiedDataSmoke(db: Database): Promise<Outcome[]> {
  const out: Outcome[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, ok, detail });

  const city = makeCity({ id: randomUUID() as CityId, slug: `smoke-${randomUUID()}` as never });
  await cityRepo(db).insertMissing([city]);
  const seed = async (label: string) => {
    const shelter = makeShelter({
      displayName: `Смоук без даних ${label} ${city.id.slice(0, 6)}`,
      publicLocation: { precision: "city", cityId: city.id, district: null },
      verification: PENDING,
    });
    await shelterRepo(db).insert(shelter);
    return shelter;
  };

  const bare = makeShelter({
    displayName: `Смоук без даних bare ${city.id.slice(0, 6)}`,
    publicLocation: { precision: "city", cityId: city.id, district: null },
    verification: PENDING,
  });
  const bareInsert = await outcomeOf(
    db.insert(shelters).values({
      ...shelterToRow(bare),
      legalEntity: null,
      exactAddress: null,
      exactLat: null,
      exactLng: null,
    }),
  );
  const [bareRow] = await db
    .select({ legal: shelters.legalEntity, address: shelters.exactAddress, lat: shelters.exactLat })
    .from(shelters)
    .where(eq(shelters.id, bare.id));
  check(
    "0024: a pending shelter is inserted with legal entity, address and point all null",
    bareInsert === "accepted" &&
      bareRow?.legal === null &&
      bareRow.address === null &&
      bareRow.lat === null,
    `${bareInsert}, row ${bareRow === undefined ? "missing" : "read back"}`,
  );

  const half = await seed("half");
  const halfPoint = await outcomeOf(
    db.execute(sql`UPDATE shelters SET exact_lng = NULL WHERE id = ${half.id}`),
  );
  check(
    "0024: a latitude without a longitude is refused by shelters_exact_point_all_or_none",
    halfPoint === "shelters_exact_point_all_or_none",
    halfPoint,
  );

  const pointOnly = await seed("point");
  const pointNoAddress = await outcomeOf(
    db.execute(sql`UPDATE shelters SET exact_address = NULL WHERE id = ${pointOnly.id}`),
  );
  check(
    "0024: a point without an address is refused by shelters_exact_point_needs_address",
    pointNoAddress === "shelters_exact_point_needs_address",
    pointNoAddress,
  );

  const approved = await seed("verified");
  const verifiedBare = await outcomeOf(
    db.execute(
      sql`UPDATE shelters SET verification_status = 'verified', legal_entity = NULL WHERE id = ${approved.id}`,
    ),
  );
  check(
    "0024: a verified shelter without its legal entity is refused by shelters_verified_has_verified_data",
    verifiedBare === "shelters_verified_has_verified_data",
    verifiedBare,
  );

  return out;
}
