import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import type { CityId, ShelterVerification } from "@opika/domain";
import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonymousRouterClient } from "../../api/server-client";
import { createTestHarness, type TestHarness } from "../../api/test-harness";
import { loadCityPage } from "../../features/gallery/city-page-load";
import { WithMockRouter } from "../../features/gallery/test-router";
import { renderGallery } from "./page";

let h: TestHarness;

beforeAll(async () => {
  h = await createTestHarness();
});
afterAll(async () => {
  await h.cleanup();
});
beforeEach(async () => {
  await h.truncate();
});

const DAY = 86_400_000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: daysAgo(3),
  evidence: { items: [], submittedAt: daysAgo(30) },
};

async function seedCity(slug: string, uk: string) {
  const city = makeCity({
    slug: slug as never,
    name: { uk, en: { text: slug, provenance: "human" } },
  });
  await cityRepo(h.db).insert(city);
  return city.id;
}

async function seedAnimalIn(cityId: CityId, shelterExtra: Parameters<typeof makeShelter>[0] = {}) {
  const shelter = makeShelter({
    publicLocation: {
      precision: "fuzzed_address",
      cityId,
      district: null,
      approximate: { center: { lat: 50.51, lng: 30.79 }, precisionMetres: 1000 } as never,
    },
    ...shelterExtra,
  });
  await shelterRepo(h.db).insert(shelter);
  await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter.id }), cityId);
}

/** Two cities with a page, and one whose only animal is an early-listed shelter's (visible, no page). */
async function seedCities() {
  await seedAnimalIn(await seedCity("kyiv", "Київ"));
  await seedAnimalIn(await seedCity("brovary", "Бровари"));
  await seedAnimalIn(await seedCity("irpin", "Ірпінь"), {
    verification: PENDING,
    earlyListingSince: daysAgo(2),
  });
}

const client = () => anonymousRouterClient(h.db);
const cityHrefs = () =>
  within(screen.getByRole("navigation", { name: "Міста" }))
    .getAllByRole("link")
    .map((link) => link.getAttribute("href"));
const allHrefs = () => screen.getAllByRole("link").map((link) => link.getAttribute("href"));

describe("the cities block (crawlable links to the city pages)", () => {
  it("the gallery links every city that has a page, in Ukrainian order, and no other", async () => {
    await seedCities();
    render(<WithMockRouter>{await renderGallery(client())}</WithMockRouter>);

    expect(cityHrefs()).toEqual(["/tvaryny/misto/brovary", "/tvaryny/misto/kyiv"]);
    expect(allHrefs()).not.toContain("/tvaryny/misto/irpin");
  });

  it("a city page links the other cities with a page, not itself", async () => {
    await seedCities();
    const load = await loadCityPage("kyiv", client());
    if (load.kind !== "city") throw new Error("expected the city page");
    render(
      <WithMockRouter>
        {await renderGallery(client(), {}, false, { city: load.city })}
      </WithMockRouter>,
    );

    expect(cityHrefs()).toEqual(["/tvaryny/misto/brovary"]);
    expect(allHrefs()).not.toContain("/tvaryny/misto/irpin");
  });

  it("an empty result (no cat anywhere) still lists the cities: a filter does not hide them", async () => {
    await seedCities();
    render(<WithMockRouter>{await renderGallery(client(), { vyd: "cat" })}</WithMockRouter>);

    expect(screen.getByTestId("gallery-no-match")).toBeTruthy();
    expect(cityHrefs()).toEqual(["/tvaryny/misto/brovary", "/tvaryny/misto/kyiv"]);
  });

  it("is absent when no city has a page", async () => {
    await seedAnimalIn(await seedCity("irpin", "Ірпінь"), {
      verification: PENDING,
      earlyListingSince: daysAgo(2),
    });
    render(<WithMockRouter>{await renderGallery(client())}</WithMockRouter>);

    expect(screen.queryByRole("navigation", { name: "Міста" })).toBeNull();
  });
});
