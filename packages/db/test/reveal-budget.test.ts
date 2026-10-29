import { neonConfig } from "@neondatabase/serverless";
import type { AdopterId, AnimalId, CityId, ContactReveal, ShelterId } from "@opika/domain";
import { and, countDistinct, eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, createDatabaseWithClient, type Database } from "../src/client";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { type RevealBudget, revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { reveals } from "../src/schema/reveals";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";
import { TEST_DATABASE_URL } from "../src/test-utils/setup";

/**
 * Audit F8, the owner's S3 scope (2026-10-29): the per-adopter reveal budget (30 distinct
 * shelters a day, re-revealing a counted shelter free) held by the write itself, not only by the
 * check before it. The race is forced, never run under load (CLAUDE.md, agent rules): one
 * reveal's transaction is held open after its insert while a second, on its own connection, is
 * shown by the database itself to wait on it.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-29T12:00:00.000Z");
const BUDGET: RevealBudget = { since: new Date(NOW.getTime() - 86_400_000), maxShelters: 30 };

type Spot = { shelterId: ShelterId; animalIds: AnimalId[] };

let city: CityId;
async function shelterWith(animals = 1): Promise<Spot> {
  const shelter = makeShelter({
    exactAddress: {
      line1: "вул. Тестова 1",
      line2: null,
      postalCode: "01001",
      cityId: city,
      district: null,
      coordinates: { lat: 50.45, lng: 30.52 },
    },
  });
  await shelterRepo(db).insert(shelter);
  const animalIds: AnimalId[] = [];
  for (let i = 0; i < animals; i++) {
    const animal = makeAnimal({ shelterId: shelter.id });
    await animalRepo(db).insert(animal, city);
    animalIds.push(animal.id);
  }
  return { shelterId: shelter.id, animalIds };
}

async function adopter(): Promise<AdopterId> {
  const profile = makeAdopter();
  await adopterRepo(db).insert(profile);
  return profile.id;
}

const revealOf = (adopterId: AdopterId, spot: Spot, animal = 0, revealedAt = NOW) =>
  makeReveal({
    adopterId,
    shelterId: spot.shelterId,
    animalId: spot.animalIds[animal] as AnimalId,
    revealedAt,
  });

/** `count` shelters this adopter has already revealed, each through its own first animal. */
async function revealed(adopterId: AdopterId, count: number, revealedAt = NOW): Promise<Spot[]> {
  const spots: Spot[] = [];
  for (let i = 0; i < count; i++) {
    const spot = await shelterWith(2);
    await revealRepo(db).insert(revealOf(adopterId, spot, 0, revealedAt));
    spots.push(spot);
  }
  return spots;
}

async function distinctShelters(adopterId: AdopterId): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(reveals.shelterId) })
    .from(reveals)
    .where(eq(reveals.adopterId, adopterId));
  return row?.n ?? 0;
}

async function rowsOf(adopterId: AdopterId, animalId: AnimalId): Promise<number> {
  const rows = await db
    .select({ id: reveals.id })
    .from(reveals)
    .where(and(eq(reveals.adopterId, adopterId), eq(reveals.animalId, animalId)));
  return rows.length;
}

beforeEach(async () => {
  const c = makeCity();
  await cityRepo(db).insert(c);
  city = c.id;
});

describe("revealRepo.insertWithinShelterBudget, one reveal at a time", () => {
  it("writes the 30th distinct shelter and refuses the 31st, writing nothing", async () => {
    const me = await adopter();
    await revealed(me, 29);
    const thirtieth = await shelterWith();
    const thirtyFirst = await shelterWith();

    const at30 = revealOf(me, thirtieth);
    expect(await revealRepo(db).insertWithinShelterBudget(at30, BUDGET)).toBe("inserted");
    expect(await revealRepo(db).findById(at30.id)).toEqual(at30);

    const at31 = revealOf(me, thirtyFirst);
    expect(await revealRepo(db).insertWithinShelterBudget(at31, BUDGET)).toBe("over_budget");
    expect(await revealRepo(db).findById(at31.id)).toBeNull();
    expect(await distinctShelters(me)).toBe(30);
  });

  it("at 30, another animal of a shelter already counted is free, any number of times", async () => {
    const me = await adopter();
    const spots = await revealed(me, 30);
    const counted = spots[7] as Spot;
    const again = revealOf(me, counted, 1);
    expect(await revealRepo(db).insertWithinShelterBudget(again, BUDGET)).toBe("inserted");
    expect(await distinctShelters(me)).toBe(30);
  });

  it("the same animal again is never a second row, at any count", async () => {
    const me = await adopter();
    const [spot] = await revealed(me, 1);
    const duplicate = revealOf(me, spot as Spot, 0);
    expect(await revealRepo(db).insertWithinShelterBudget(duplicate, BUDGET)).toBe(
      "animal_already_revealed",
    );
    expect(await rowsOf(me, (spot as Spot).animalIds[0] as AnimalId)).toBe(1);
  });

  it("counts only this adopter's reveals, and only inside the window", async () => {
    const me = await adopter();
    const someoneElse = await adopter();
    await revealed(someoneElse, 30);
    const [old] = await revealed(me, 1, BUDGET.since);
    await revealed(me, 29);
    // 29 inside the window: another adopter's 30 and my own reveal at the window's edge don't count.
    const thirtieth = revealOf(me, await shelterWith());
    expect(await revealRepo(db).insertWithinShelterBudget(thirtieth, BUDGET)).toBe("inserted");
    // At 30, the shelter revealed only before the window is new again, not free.
    const outside = revealOf(me, old as Spot, 1);
    expect(await revealRepo(db).insertWithinShelterBudget(outside, BUDGET)).toBe("over_budget");
  });
});

/** Whether a backend is blocked by `pid`, asked of the database until `alongside` settles. */
async function waitsOn(
  observer: postgres.Sql,
  pid: number,
  alongside: Promise<unknown>,
): Promise<boolean> {
  let settled = false;
  alongside.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  while (!settled) {
    const [row] = await observer<{ waiting: number }[]>`
      SELECT count(*)::int AS waiting FROM pg_stat_activity
      WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
    if ((row?.waiting ?? 0) > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

describe("two reveals by one adopter at once, at the boundary (audit F8)", () => {
  let other: postgres.Sql;
  let observer: postgres.Sql;
  let second: Database;
  beforeAll(() => {
    other = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
    observer = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
    second = createDatabaseWithClient(other);
  });
  afterAll(async () => {
    await Promise.all([other.end({ timeout: 0 }), observer.end({ timeout: 0 })]);
  });

  it.each([
    ["a new shelter: over budget once the first commits", "new", "over_budget", 30],
    ["another animal of the first's shelter: free once it commits", "same_shelter", "inserted", 30],
    ["the first's own animal: never a second row", "same_animal", "animal_already_revealed", 30],
  ] as const)("%s", async (_label, kind, expected, finalShelters) => {
    const me = await adopter();
    await revealed(me, 29);
    const firstSpot = await shelterWith(2);
    const first = revealOf(me, firstSpot);
    const secondReveal: ContactReveal =
      kind === "new"
        ? revealOf(me, await shelterWith())
        : revealOf(me, firstSpot, kind === "same_shelter" ? 1 : 0);

    let secondOutcome: Promise<string> | undefined;
    await db.transaction(async (tx) => {
      const [self] = await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
      // The first reveal writes the 30th shelter and stays uncommitted, its lock held.
      expect(
        await revealRepo(tx as unknown as Database).insertWithinShelterBudget(first, BUDGET),
      ).toBe("inserted");
      // The second passed any check made before this point; its write now meets the first's.
      secondOutcome = revealRepo(second).insertWithinShelterBudget(secondReveal, BUDGET);
      expect(
        await waitsOn(observer, self?.pid ?? 0, secondOutcome),
        "the second reveal's write must wait for the first's transaction, not run past it",
      ).toBe(true);
    });
    expect(await secondOutcome).toBe(expected);
    expect(await distinctShelters(me)).toBe(finalShelters);
    expect(await rowsOf(me, first.animalId)).toBe(1);
  });
});

describe("on neon-http (the production driver)", () => {
  it("sends the lock and the guarded insert as one READ COMMITTED transaction, lock first", async () => {
    const before = {
      fetchEndpoint: neonConfig.fetchEndpoint,
      fetchFunction: neonConfig.fetchFunction,
    };
    const bodies: unknown[] = [];
    const isolation: (string | null)[] = [];
    neonConfig.fetchEndpoint = () => "https://neon-http.invalid/sql";
    neonConfig.fetchFunction = async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      isolation.push(new Headers(init.headers).get("neon-batch-isolation-level"));
      return new Response(JSON.stringify({ message: "stop here", code: "XX000" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    };
    try {
      // Built as production builds it; the fetch above keeps it in the process.
      const neonDb = createDatabase(
        "postgresql://test:test@ep-test-1.eu-central-1.aws.neon.tech/x",
      );
      const reveal = makeReveal();
      await expect(revealRepo(neonDb).insertWithinShelterBudget(reveal, BUDGET)).rejects.toThrow();
      expect(bodies).toHaveLength(1);
      expect(isolation).toEqual(["ReadCommitted"]);
      const queries = (bodies[0] as { queries?: { query: string }[] }).queries ?? [];
      expect(queries).toHaveLength(2);
      expect(queries[0]?.query).toMatch(/^select .* from "adopters" .* for no key update$/);
      expect(queries[1]?.query).toMatch(
        /^insert into "reveals" \("id", "adopter_id", "animal_id", "shelter_id", "revealed_at", "shelter_snapshot", "animal_snapshot"\) SELECT /,
      );
      expect(queries[1]?.query).toContain('count(distinct "shelter_id")');
    } finally {
      neonConfig.fetchEndpoint = before.fetchEndpoint;
      neonConfig.fetchFunction = before.fetchFunction;
    }
  });
});
