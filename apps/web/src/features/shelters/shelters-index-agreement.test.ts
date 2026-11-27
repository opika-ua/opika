import { randomUUID } from "node:crypto";
import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { NO_FILTERS, type ShelterVerification } from "@opika/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonymousRouterClient } from "../../api/server-client";
import { createTestHarness, type TestHarness } from "../../api/test-harness";
import { loadShelterPage } from "./shelter-page-load";
import { loadSheltersIndex } from "./shelters-index-load";

/**
 * The shelter page names the «Притулки» level on its own rule (`listedInSheltersIndex`) so as to
 * read nothing extra; this pins that rule to what `/prytulky` really lists, on the same rows.
 */
describe("the shelter page's «Притулки» level agrees with the /prytulky list", () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestHarness();
    await h.truncate();
  });
  afterAll(async () => {
    await h.cleanup();
  });

  const NOW = new Date();
  const MODERATOR = randomUUID() as never;
  const EVIDENCE = { items: [], submittedAt: NOW };
  const verified = { verifiedAt: NOW, verifiedBy: MODERATOR };
  const paused: ShelterVerification = {
    status: "paused",
    ...verified,
    pausedAt: NOW,
    pausedBy: { kind: "moderator", moderatorId: MODERATOR },
    reason: { code: "relocation", note: null },
    evidence: EVIDENCE,
  };
  const pending: ShelterVerification = {
    status: "pending",
    submittedAt: NOW,
    evidence: EVIDENCE,
  };

  async function seed(animals: number, verification?: ShelterVerification, early = false) {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      publicLocation: {
        precision: "fuzzed_address",
        cityId: city.id,
        district: null,
        approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
      },
      ...(verification ? { verification } : {}),
      earlyListingSince: early ? new Date(NOW.getTime() - 5 * 86_400_000) : null,
    });
    await shelterRepo(h.db).insert(shelter);
    for (let i = 0; i < animals; i++) {
      const animal = makeAnimal({
        shelterId: shelter.id,
        listing: {
          kind: "published",
          publishedAt: new Date(NOW.getTime() - 3 * 86_400_000),
          confirmedAt: new Date(NOW.getTime() - 86_400_000),
          undoable: null,
        },
      });
      await animalRepo(h.db).insert(animal, city.id);
    }
    return shelter.id;
  }

  it("shows the level for exactly the shelters the list holds, and never for the rest", async () => {
    const cases = [
      { name: "verified with animals", id: await seed(2), shown: true },
      { name: "verified with several animals", id: await seed(5), shown: true },
      {
        name: "under review (pending, listed early)",
        id: await seed(2, pending, true),
        shown: false,
      },
      { name: "paused", id: await seed(2, paused), shown: false },
      { name: "verified with no listed animal", id: await seed(0), shown: false },
    ];
    const index = await loadSheltersIndex(anonymousRouterClient(h.db));
    if (index.kind !== "index") throw new Error(index.kind);
    const inList = new Set<string>(index.groups.flatMap((g) => g.shelters.map((s) => s.id)));

    for (const { name, id, shown } of cases) {
      const page = await loadShelterPage(
        id,
        { sort: "freshest", page: 1, filters: NO_FILTERS },
        anonymousRouterClient(h.db),
      );
      if (page.kind !== "shelter") throw new Error(`${name}: ${page.kind}`);
      expect(page.view.sheltersIndexListed, name).toBe(shown);
      // The pinned direction: a level on the page means the list has the shelter.
      if (page.view.sheltersIndexListed) expect(inList.has(id), name).toBe(true);
    }
  });
});
