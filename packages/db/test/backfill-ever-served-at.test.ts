import type { Shelter } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { countBackfillCandidates, runBackfill } from "../src/backfill-ever-served-at";
import { animalRepo } from "../src/repos/animal-repo";
import { cityRepo } from "../src/repos/city-repo";
import { shelterRepo } from "../src/repos/shelter-repo";
import {
  makeAnimal,
  makeCity,
  makeShelter,
  setupTestDatabase,
  truncateAll,
} from "../src/test-utils/index";

/**
 * S8-F5 follow-up (PR #196): the migrate-then-merge deploy window leaves the
 * app briefly without the three write hooks, so a card that becomes visible
 * in that window keeps `everServedAt` null. This is the standalone script
 * that closes that window after the deploy: re-running the same backfill,
 * on demand, as many times as needed.
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());

let cityId: string;

beforeEach(async () => {
  await truncateAll(db);
  const city = makeCity();
  await cityRepo(db).insert(city);
  cityId = city.id;
});

/** `makeShelter`'s default exact address points at its own fixed city, not the one this suite inserts per test. */
const shelterInCity = (overrides: Partial<Shelter> = {}): Shelter =>
  makeShelter({
    ...overrides,
    publicLocation: { ...makeShelter().publicLocation, cityId } as never,
  });

describe("everServed:backfill", () => {
  it("sets a visible card left null by the deploy-window gap", async () => {
    const shelter = shelterInCity(); // verified, by the fixture's default
    await shelterRepo(db).insert(shelter);
    const gapCard = makeAnimal({ shelterId: shelter.id, everServedAt: null });
    await animalRepo(db).insert(gapCard, cityId as never);

    expect(await countBackfillCandidates(db)).toBe(1);
    expect(await runBackfill(db)).toBe(1);
    expect(await countBackfillCandidates(db)).toBe(0);
  });

  it("never touches a card that isn't currently discoverable", async () => {
    const shelter = shelterInCity();
    await shelterRepo(db).insert(shelter);
    const draft = makeAnimal({
      shelterId: shelter.id,
      everServedAt: null,
      listing: { kind: "draft" },
    });
    const withdrawn = makeAnimal({
      shelterId: shelter.id,
      everServedAt: null,
      listing: {
        kind: "withdrawn",
        withdrawnAt: new Date(),
        reason: { code: "other", note: null },
      },
    });
    await animalRepo(db).insert(draft, cityId as never);
    await animalRepo(db).insert(withdrawn, cityId as never);

    expect(await countBackfillCandidates(db)).toBe(0);
    expect(await runBackfill(db)).toBe(0);
  });

  it("never touches a card whose shelter isn't publicly verified", async () => {
    const shelter = shelterInCity({ verification: { status: "pending" } as never });
    await shelterRepo(db).insert(shelter);
    const card = makeAnimal({ shelterId: shelter.id, everServedAt: null });
    await animalRepo(db).insert(card, cityId as never);

    expect(await countBackfillCandidates(db)).toBe(0);
    expect(await runBackfill(db)).toBe(0);
  });

  it("is idempotent: a second run over an already-backfilled row sets nothing", async () => {
    const shelter = shelterInCity();
    await shelterRepo(db).insert(shelter);
    const gapCard = makeAnimal({ shelterId: shelter.id, everServedAt: null });
    await animalRepo(db).insert(gapCard, cityId as never);

    expect(await runBackfill(db)).toBe(1);
    expect(await runBackfill(db)).toBe(0);
  });

  it("never un-nulls a card that was visible once but isn't now, even though it was never stamped", async () => {
    // The one residual gap the script's own doc comment names: a card that
    // became visible and invisible again entirely inside the window, before
    // this script ever ran, is missed — not fixed by a later run, because by
    // then it no longer matches the live predicate either.
    const shelter = shelterInCity();
    await shelterRepo(db).insert(shelter);
    const cameAndWentWithinTheGap = makeAnimal({
      shelterId: shelter.id,
      everServedAt: null,
      listing: {
        kind: "withdrawn",
        withdrawnAt: new Date(),
        reason: { code: "other", note: null },
      },
    });
    await animalRepo(db).insert(cameAndWentWithinTheGap, cityId as never);

    expect(await runBackfill(db)).toBe(0);
  });
});
