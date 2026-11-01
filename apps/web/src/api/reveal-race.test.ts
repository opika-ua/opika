import type * as Repos from "@opika/db/repos";
import { animalRepo, cityRepo, revealRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeReveal, makeShelter } from "@opika/db/test";
import type { AdopterId, CityId } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestHarness, type TestHarness } from "./test-harness";

/**
 * Audit F8 through the served router: two `animals.reveal` calls by one adopter, forced to both
 * pass the budget check before either writes (a barrier after the check's count, the repository
 * wrapped, never replaced). Before S3 both wrote; now the write itself holds the budget. The lock
 * that makes the write atomic across connections is proven in `packages/db`'s
 * `reveal-budget.test.ts`; here the harness has one connection, so this is about the handler.
 */

const barrier = vi.hoisted(() => ({ arrivals: [] as (() => void)[], armed: false }));

/** Holds each caller until two have arrived, once armed. */
async function bothArrive(): Promise<void> {
  if (!barrier.armed) return;
  await new Promise<void>((resolve) => {
    barrier.arrivals.push(resolve);
    if (barrier.arrivals.length === 2) {
      barrier.armed = false;
      for (const release of barrier.arrivals.splice(0)) release();
    }
  });
}

vi.mock("@opika/db/repos", async (importOriginal) => {
  const actual = await importOriginal<typeof Repos>();
  return {
    ...actual,
    revealRepo: (db: Parameters<typeof actual.revealRepo>[0]) => {
      const repo = actual.revealRepo(db);
      return {
        ...repo,
        countDistinctSheltersRecentByAdopter: async (
          ...args: Parameters<typeof repo.countDistinctSheltersRecentByAdopter>
        ) => {
          const counted = await repo.countDistinctSheltersRecentByAdopter(...args);
          await bothArrive();
          return counted;
        },
      };
    },
  };
});

let h: TestHarness;
beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => h.cleanup());

let city: CityId;
beforeEach(async () => {
  await h.truncate();
  barrier.armed = false;
  barrier.arrivals.length = 0;
  const c = makeCity();
  await cityRepo(h.db).insert(c);
  city = c.id;
});

async function shelterWithAnimal() {
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
  await shelterRepo(h.db).insert(shelter);
  const animal = makeAnimal({ shelterId: shelter.id });
  await animalRepo(h.db).insert(animal, city);
  return { shelter, animal };
}

async function adopterAt(distinctShelters: number) {
  const res = await h.call("session.bootstrap", {});
  const cookie = h.extractSessionCookie(res.headers);
  if (cookie === null) throw new Error("bootstrap set no cookie");
  const adopterId = (res.body as { adopter: { id: AdopterId } }).adopter.id;
  for (let i = 0; i < distinctShelters; i++) {
    const { shelter, animal } = await shelterWithAnimal();
    await revealRepo(h.db).insert(
      makeReveal({
        adopterId,
        animalId: animal.id,
        shelterId: shelter.id,
        revealedAt: new Date("2026-08-01T11:00:00Z"),
      }),
    );
  }
  return { cookie, adopterId };
}

const reveal = (cookie: string, animalId: string) =>
  h.call("animals.reveal", { animalId }, { cookie });

describe("two reveals by one adopter, both past the check before either writes (audit F8)", () => {
  it("at 29 shelters, two new ones: one answers with the contacts, the other RATE_LIMITED", async () => {
    const { cookie, adopterId } = await adopterAt(29);
    const first = await shelterWithAnimal();
    const second = await shelterWithAnimal();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    barrier.armed = true;
    const answers = await Promise.all([
      reveal(cookie, first.animal.id),
      reveal(cookie, second.animal.id),
    ]);
    warn.mockRestore();

    expect(answers.map((a) => a.status).sort()).toEqual([200, 429]);
    const refused = answers.find((a) => a.status === 429);
    expect(refused?.body).toMatchObject({ code: "RATE_LIMITED", defined: true });
    const mine = await revealRepo(h.db).listByAdopter(adopterId, { limit: 100 });
    expect(new Set(mine.map((r) => r.shelterId)).size).toBe(30);
  });

  it("the same animal twice at once: both answer with the one reveal, written once", async () => {
    const { cookie, adopterId } = await adopterAt(3);
    const { animal } = await shelterWithAnimal();

    barrier.armed = true;
    const answers = await Promise.all([reveal(cookie, animal.id), reveal(cookie, animal.id)]);

    expect(answers.map((a) => a.status)).toEqual([200, 200]);
    const ids = answers.map((a) => (a.body as { id: string }).id);
    expect(ids[0]).toBe(ids[1]);
    const mine = await revealRepo(h.db).listByAdopter(adopterId, { limit: 100 });
    expect(mine.filter((r) => r.animalId === animal.id)).toHaveLength(1);
  });
});
