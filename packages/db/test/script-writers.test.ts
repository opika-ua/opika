import type { ModeratorId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertOnboardedShelter } from "../src/onboard-shelter";
import { cityRepo } from "../src/repos/city-repo";
import { kabinetShelterRepo } from "../src/repos/kabinet-shelter-repo";
import { insertSeedData } from "../src/seed";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * RG-Q8 at the scripts themselves (review of the scripts row, finding 4):
 * the seed's and onboarding's own write paths record history, so switching
 * either back to a bare insert turns this red.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const NOW = new Date("2026-10-13T10:00:00.000Z");
const MOD = "0ec0ec0e-0000-4000-8000-0000000000aa" as ModeratorId;
const history = (shelterId: string) => kabinetShelterRepo(db).historyOf(shelterId as never);

describe("insertSeedData", () => {
  it("records shelter_created per shelter and one animals_imported per shelter with its count", async () => {
    const city = makeCity();
    const a = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
    const b = makeShelter({ publicLocation: { ...makeShelter().publicLocation, cityId: city.id } });
    const animals = [
      makeAnimal({ shelterId: a.id }),
      makeAnimal({ shelterId: a.id }),
      makeAnimal({ shelterId: b.id }),
    ].map((animal) => ({ animal, cityId: city.id }));
    await insertSeedData(
      db,
      { cities: [city], shelters: [a, b], animals },
      { moderatorId: MOD, now: NOW },
    );
    expect(await history(a.id)).toEqual(
      expect.arrayContaining([
        { kind: "shelter_created", at: NOW, moderatorId: MOD, via: "script" },
        { kind: "animals_imported", at: NOW, moderatorId: MOD, count: 2 },
      ]),
    );
    expect((await history(b.id)).find((e) => e.kind === "animals_imported")).toMatchObject({
      count: 1,
    });
  });
});

describe("insertOnboardedShelter", () => {
  it("inserts once with its shelter_created line, and a re-run inserts and records nothing", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    const by = { moderatorId: MOD, now: NOW };
    expect(await insertOnboardedShelter(db, shelter, by)).toBe("inserted");
    expect(await insertOnboardedShelter(db, shelter, by)).toBe("exists");
    expect(await history(shelter.id)).toEqual([
      { kind: "shelter_created", at: NOW, moderatorId: MOD, via: "script" },
    ]);
  });
});
