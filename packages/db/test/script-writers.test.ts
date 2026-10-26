import type { ModeratorId, ShelterAdminId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertOnboardedShelter, verificationForNewAnimals } from "../src/onboard-shelter";
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

/**
 * Tier 1 review finding 1, PR #196: `buildShelter` always builds a shelter
 * at `verified` - the status onboarding gives it, not necessarily the
 * status it's still at by the time a second run adds another animal.
 * `verificationForNewAnimals` is what a re-run's new animals get stamped
 * with instead; this is its own regression test, independent of `main()`,
 * which this package deliberately doesn't unit-test (see onboard-shelter.ts's
 * own module comment on why the CLI orchestration isn't covered here).
 */
describe("verificationForNewAnimals", () => {
  it("uses the shelter's own verification on first insert", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    const result = await insertOnboardedShelter(db, shelter, { moderatorId: MOD, now: NOW });
    expect(result).toBe("inserted");
    expect(await verificationForNewAnimals(db, shelter, result)).toEqual(shelter.verification);
  });

  it("uses the shelter's real, current verification on a re-run - not the freshly-built shelter's optimistic one", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    await insertOnboardedShelter(db, shelter, { moderatorId: MOD, now: NOW });

    // The shelter has since been paused - exactly the gap finding 1 found:
    // a re-run's `buildShelter` call still produces `status: "verified"`.
    await kabinetShelterRepo(db).applyAudited({
      shelterId: shelter.id,
      expectedVersion: shelter.version,
      change: {
        kind: "verification",
        verification: {
          status: "paused",
          verifiedAt: NOW,
          verifiedBy: MOD,
          pausedAt: NOW,
          pausedBy: { kind: "shelter_admin", shelterAdminId: "admin-1" as ShelterAdminId },
          reason: { code: "other", note: null },
          evidence: { items: [], submittedAt: NOW },
        } as never,
      },
      entry: {
        kind: "verification",
        event: {
          type: "pause",
          at: NOW,
          actor: { kind: "shelter_admin", shelterAdminId: "admin-1" as ShelterAdminId },
          reason: { code: "other", note: null },
        },
        from: "verified",
        to: "paused",
      },
      historyId: "h1",
      now: NOW,
    });

    // The script is re-run with the same input: `shelter` still carries its
    // original "verified" value - a freshly built shelter has no other
    // state to report - exactly what `buildShelter` would produce again on
    // a second run with the same input file.
    const result = await insertOnboardedShelter(db, shelter, { moderatorId: MOD, now: NOW });
    expect(result).toBe("exists");
    expect((await verificationForNewAnimals(db, shelter, result)).status).toBe("paused");
  });

  it("throws rather than silently stamping, if the shelter vanished between the check and the read", async () => {
    const city = makeCity();
    await cityRepo(db).insert(city);
    const shelter = makeShelter({
      publicLocation: { ...makeShelter().publicLocation, cityId: city.id },
    });
    // Never inserted: the shelter the "exists" branch expects to find isn't there.
    await expect(verificationForNewAnimals(db, shelter, "exists")).rejects.toThrow(
      /was reported as existing but not found/,
    );
  });
});
