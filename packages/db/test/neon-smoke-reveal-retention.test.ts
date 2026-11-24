import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/client";
import { adopterRepo } from "../src/repos/adopter-repo";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { revealRepo } from "../src/repos/reveal-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAdopter,
  makeAnimal,
  makeCity,
  makeReveal,
  makeShelter,
  setupTestDatabase,
} from "../src/test-utils/index";
import { runRevealRetentionSmoke } from "./neon-smoke-reveal-retention";

/** 0031 smoke steps, proven locally first: postgres-js, then neon-http's `{ rows }` raw shape. */
describe("runRevealRetentionSmoke against the local database", () => {
  let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
  let cleanup: () => Promise<void>;
  beforeAll(async () => {
    ({ db, cleanup } = await setupTestDatabase());
  });
  afterAll(async () => cleanup?.());

  it("passes every check, and there are 3", async () => {
    const outcomes = await runRevealRetentionSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(3);
  });

  it("passes the same over a driver whose raw results are `{ rows }`", async () => {
    const neonHttpRawShape = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "execute") {
          return async (query: SQL) => ({
            rows: Array.from(await target.execute(query)),
            fields: [],
          });
        }
        return Reflect.get(target, property, receiver);
      },
    }) as Database;
    const outcomes = await runRevealRetentionSmoke(neonHttpRawShape);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
  });

  // A copy of production made before its six-hourly clean-up got to an old reveal: not this run's,
  // and it may not fail it.
  it("passes on a branch that already holds an old reveal of its own", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      premises: {
        kind: "address",
        address: { ...makeShelter().premises.address, cityId: city.id },
      },
    });
    await shelterRepo(db).insert(shelter);
    const animal = makeAnimal({ shelterId: shelter.id });
    await animalRepo(db).insert(animal, city.id);
    const adopter = makeAdopter({ createdAt: new Date(Date.now() - 200 * 86_400_000) });
    await adopterRepo(db).insert(adopter);
    await revealRepo(db).insert(
      makeReveal({
        adopterId: adopter.id,
        animalId: animal.id,
        shelterId: shelter.id,
        revealedAt: new Date(Date.now() - 150 * 86_400_000),
      }),
    );
    const outcomes = await runRevealRetentionSmoke(db);
    expect(outcomes.filter((o) => !o.ok)).toEqual([]);
    expect(outcomes).toHaveLength(3);
  });
});
