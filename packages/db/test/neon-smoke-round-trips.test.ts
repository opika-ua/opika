import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import { makeAnimal, makeCity, makeShelter, setupTestDatabase } from "../src/test-utils/index";
import { runRoundTripsSmoke } from "./neon-smoke-round-trips";

/** The round-trip PR's smoke steps, proven locally first (postgres-js). */
describe("runRoundTripsSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 6", async () => {
    const outcomes = await runRoundTripsSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(6);
  });

  /**
   * The 2026-11-24 sitting failed here: production gained an early-listed shelter with public
   * animals, which the gallery lists and the sitemap (verified shelters only) leaves out.
   */
  it("still passes with an early-listed shelter's public animals on the branch", async () => {
    const city = makeCity();
    await cityRepo(db).insertMissing([city]);
    const now = new Date();
    const shelter = makeShelter({
      verification: {
        status: "pending",
        submittedAt: now,
        evidence: { items: [], submittedAt: now },
      },
      earlyListingSince: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await shelterRepo(db).insert(shelter);
    for (const name of ["Рання 1", "Рання 2"]) {
      await animalRepo(db).insert(makeAnimal({ shelterId: shelter.id, name }), city.id);
    }
    const outcomes = await runRoundTripsSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
  });
});
