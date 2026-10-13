import { publicLocationOf, type ShelterId, testOnlyLocationPolicy } from "@opika/domain";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { productionLocationPolicy } from "../src/location-policy";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { shelters } from "../src/schema/shelters";
import { makeCity, makeShelter, setupTestDatabase, truncateAll } from "../src/test-utils/index";
import { exitCodeOf, formatReport, verifyShelterLocations } from "../src/verify-locations";

/**
 * RG-Q10 (Oleksii): location:verify recomputes every shelter's public location
 * with the configured key and compares it with the stored one; the output
 * carries counts only. RG-Q11 (Oleksii): seeded rows are classified by
 * identity, not by key: seed-range id + test-only key is "demo", not a
 * mismatch; test-only key outside the seed range is a hard failure of its own.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

const KEY = "k".repeat(32);
const OTHER_KEY = "o".repeat(32);
const production = productionLocationPolicy(KEY);
/** The seed's key, written out: a drifted shared constant must turn these tests red. */
const testKey = testOnlyLocationPolicy("seed");
/** The seed's reserved range, written out rather than built from the constant under test. */
const seedId = (n: number) => `51000000-0000-4000-8000-00000000000${n}` as ShelterId;
let cityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

/** A shelter whose stored public location was computed with `policy`. */
const insertWith = async (policy: Parameters<typeof publicLocationOf>[2], id?: ShelterId) => {
  const base = makeShelter({
    ...(id === undefined ? {} : { id }),
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
  });
  const shelter = { ...base, publicLocation: publicLocationOf(base.id, base.exactAddress, policy) };
  await shelterRepo(db).insert(shelter);
  return shelter;
};

describe("location:verify", () => {
  it("matches every shelter onboarded with the same key, and passes", async () => {
    await insertWith(production);
    await insertWith(production);
    const report = await verifyShelterLocations(db, KEY);
    expect(report).toEqual({ match: 2, demo: 0, testKeyOnRealShelter: 0, mismatch: 0 });
    expect(exitCodeOf(report)).toBe(0);
  });

  it("reports every shelter as a mismatch under a different key, and fails", async () => {
    await insertWith(production);
    await insertWith(production);
    const report = await verifyShelterLocations(db, OTHER_KEY);
    expect(report).toEqual({ match: 0, demo: 0, testKeyOnRealShelter: 0, mismatch: 2 });
    expect(exitCodeOf(report)).toBe(1);
  });

  it("counts a stored location changed after the fact as a mismatch", async () => {
    const shelter = await insertWith(production);
    await insertWith(production);
    const location = shelter.publicLocation;
    if (location.precision !== "fuzzed_address") throw new Error("unreachable");
    const moved = await db
      .update(shelters)
      .set({
        publicLocation: {
          ...location,
          approximate: {
            ...location.approximate,
            center: {
              ...location.approximate.center,
              lat: location.approximate.center.lat + 0.0001,
            },
          },
        } as never,
      })
      .where(eq(shelters.id, shelter.id))
      .returning({ id: shelters.id });
    expect(moved).toHaveLength(1);
    const report = await verifyShelterLocations(db, KEY);
    expect(report).toEqual({ match: 1, demo: 0, testKeyOnRealShelter: 0, mismatch: 1 });
    expect(exitCodeOf(report)).toBe(1);
  });

  it("counts a seed-range shelter on the test-only key as demo, and still passes", async () => {
    await insertWith(production);
    await insertWith(testKey, seedId(1));
    await insertWith(testKey, seedId(2));
    const report = await verifyShelterLocations(db, KEY);
    expect(report).toEqual({ match: 1, demo: 2, testKeyOnRealShelter: 0, mismatch: 0 });
    expect(exitCodeOf(report)).toBe(0);
  });

  it("fails on the test-only key outside the seed range, as its own failure", async () => {
    await insertWith(production);
    await insertWith(testKey, seedId(1));
    await insertWith(testKey);
    const report = await verifyShelterLocations(db, KEY);
    expect(report).toEqual({ match: 1, demo: 1, testKeyOnRealShelter: 1, mismatch: 0 });
    expect(exitCodeOf(report)).toBe(1);
  });

  it("counts a seed-range shelter matching neither key as a mismatch, not demo", async () => {
    await insertWith(productionLocationPolicy(OTHER_KEY), seedId(1));
    const report = await verifyShelterLocations(db, KEY);
    expect(report).toEqual({ match: 0, demo: 0, testKeyOnRealShelter: 0, mismatch: 1 });
    expect(exitCodeOf(report)).toBe(1);
  });

  it("prints counts only, and names the privacy failure when there is one", async () => {
    await insertWith(production);
    await insertWith(testKey, seedId(1));
    await insertWith(testKey);
    expect(formatReport(await verifyShelterLocations(db, KEY)).join("\n")).toBe(
      [
        "match     1",
        "demo      1  (seeded fictional shelters on the test-only key)",
        "MISMATCH  0",
        "PRIVACY   1  shelter(s) outside the seed's id range carry the test-only key's offset: " +
          "their fuzz is reproducible from public code. Recompute them with the production key.",
      ].join("\n"),
    );
  });

  it("prints no privacy line when no real shelter carries the test-only key", async () => {
    await insertWith(production);
    await insertWith(testKey, seedId(1));
    expect(formatReport(await verifyShelterLocations(db, KEY))).toEqual([
      "match     1",
      "demo      1  (seeded fictional shelters on the test-only key)",
      "MISMATCH  0",
    ]);
  });
});
