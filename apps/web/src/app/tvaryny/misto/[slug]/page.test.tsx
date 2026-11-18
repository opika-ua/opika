import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { citySlugAliases } from "@opika/db/schema";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import type { CityId, ShelterVerification } from "@opika/domain";
import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonymousRouterClient } from "../../../../api/server-client";
import { createTestHarness, type TestHarness } from "../../../../api/test-harness";
import { loadCityPage } from "../../../../features/gallery/city-page-load";
import { WithMockRouter } from "../../../../features/gallery/test-router";
import { renderGallery } from "../../page";

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
const EVIDENCE = { items: [], submittedAt: daysAgo(30) };
const PENDING: ShelterVerification = {
  status: "pending",
  submittedAt: daysAgo(3),
  evidence: EVIDENCE,
};
const PAUSED: ShelterVerification = {
  status: "paused",
  verifiedAt: daysAgo(30),
  verifiedBy: "m0000000-0000-4000-8000-000000000001" as never,
  pausedAt: daysAgo(2),
  pausedBy: { kind: "moderator", moderatorId: "m0000000-0000-4000-8000-000000000001" as never },
  reason: { code: "relocation", note: null },
  evidence: EVIDENCE,
};

async function seedCity(slug: string, uk: string) {
  const city = makeCity({
    slug: slug as never,
    name: { uk, en: { text: slug, provenance: "human" } },
  });
  await cityRepo(h.db).insert(city);
  return city.id;
}

async function seedShelter(cityId: CityId, extra: Parameters<typeof makeShelter>[0] = {}) {
  const shelter = makeShelter({
    publicLocation: {
      precision: "fuzzed_address",
      cityId,
      district: null,
      approximate: { center: { lat: 50.51, lng: 30.79 }, precisionMetres: 1000 } as never,
    },
    ...extra,
  });
  await shelterRepo(h.db).insert(shelter);
  return shelter.id;
}

const load = (slug: string) => loadCityPage(slug, anonymousRouterClient(h.db));

describe("/tvaryny/misto/{slug}: the page exists only with an indexable animal (SEO B3)", () => {
  it("answers for a city with a verified shelter's listed animal", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    const shelter = await seedShelter(brovary);
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter, species: "cat" }), brovary);

    const result = await load("brovary");
    expect(result).toMatchObject({ kind: "city", city: { slug: "brovary" }, species: ["cat"] });
  });

  it("is not found for an unknown slug, a city with no animal, and a legacy id", async () => {
    await seedCity("irpin", "Ірпінь");
    const brovary = await seedCity("brovary", "Бровари");
    const shelter = await seedShelter(brovary);
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter }), brovary);

    expect(await load("atlantis")).toEqual({ kind: "not_found" });
    expect(await load("irpin")).toEqual({ kind: "not_found" });
    // An id was never a city page address, even for a city that has one.
    expect(await load(brovary)).toEqual({ kind: "not_found" });
  });

  it("is not found when the only animals belong to an early-listed or a paused shelter", async () => {
    const early = await seedCity("bucha", "Буча");
    const paused = await seedCity("obukhiv", "Обухів");
    const earlyShelter = await seedShelter(early, {
      verification: PENDING,
      earlyListingSince: daysAgo(2),
    });
    const pausedShelter = await seedShelter(paused, { verification: PAUSED });
    await animalRepo(h.db).insert(makeAnimal({ shelterId: earlyShelter }), early);
    await animalRepo(h.db).insert(makeAnimal({ shelterId: pausedShelter }), paused);

    expect(await load("bucha")).toEqual({ kind: "not_found" });
    expect(await load("obukhiv")).toEqual({ kind: "not_found" });
  });

  it("an animal fostered in another city puts up that city's page, not only its shelter's", async () => {
    const kyiv = await seedCity("kyiv", "Київ");
    const irpin = await seedCity("irpin", "Ірпінь");
    const shelter = await seedShelter(kyiv);
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter }), irpin);

    expect(await load("irpin")).toMatchObject({ kind: "city", city: { slug: "irpin" } });
    expect(await load("kyiv")).toEqual({ kind: "not_found" });
  });

  it("a former slug of a city with a page is moved to the current slug", async () => {
    const brovary = await seedCity("brovary-kyivska", "Бровари");
    const shelter = await seedShelter(brovary);
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter }), brovary);
    await h.db
      .insert(citySlugAliases)
      .values({ slug: "brovary", cityId: brovary, reason: "legacy" });

    expect(await load("brovary")).toEqual({ kind: "moved", slug: "brovary-kyivska" });
  });
});

describe("/tvaryny/misto/{slug}: the page body", () => {
  it("shows the heading, the approved intro and the city's gallery, its links staying on the city page", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    const kyiv = await seedCity("kyiv", "Київ");
    const shelter = await seedShelter(brovary);
    await animalRepo(h.db).insertMany([
      {
        animal: makeAnimal({ shelterId: shelter, name: "Мурчик", species: "cat" }),
        cityId: brovary,
      },
      { animal: makeAnimal({ shelterId: shelter, name: "Бровко" }), cityId: kyiv },
    ]);
    const result = await load("brovary");
    if (result.kind !== "city") throw new Error(`expected the city, got ${result.kind}`);

    const element = await renderGallery(
      anonymousRouterClient(h.db),
      // A city page ignores a place param in its own query: the city comes from the path.
      { misto: "kyiv", vyd: "cat" },
      false,
      { city: result.city },
    );
    render(<WithMockRouter>{element}</WithMockRouter>);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Шукають дім: Бровари");
    expect(
      screen.getByText(
        "Тварини з притулків і від волонтерів із міста Бровари. Оберіть тварину й напишіть напряму – контакти на кожній картці.",
      ),
    ).toBeTruthy();
    const grid = within(screen.getByTestId("gallery-grid"));
    expect(grid.getAllByRole("link").map((link) => link.textContent)).toEqual([
      expect.stringContaining("Мурчик"),
    ]);
    // Another filter keeps the visitor on the city page; «all species» drops only the species.
    const dogs = screen.getAllByTestId("species-dog")[0];
    const any = screen.getAllByTestId("species-any")[0];
    expect(dogs?.getAttribute("href")).toBe("/tvaryny/misto/brovary?vyd=dog");
    expect(any?.getAttribute("href")).toBe("/tvaryny/misto/brovary");
  });
});

describe("/tvaryny?misto=: keeps working, its links lead to the city page when it exists", () => {
  it("renders the filtered gallery (no redirect), and its one-city links go to the city page", async () => {
    const brovary = await seedCity("brovary", "Бровари");
    const shelter = await seedShelter(brovary);
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter, name: "Мурчик" }), brovary);

    const element = await renderGallery(anonymousRouterClient(h.db), { misto: "brovary" });
    render(<WithMockRouter>{element}</WithMockRouter>);

    const grid = within(screen.getByTestId("gallery-grid"));
    expect(grid.getByRole("link").textContent).toContain("Мурчик");
    expect(screen.getAllByTestId("species-cat")[0]?.getAttribute("href")).toBe(
      "/tvaryny/misto/brovary?vyd=cat",
    );
  });

  it("a city whose only shelter is early-listed has no page, so its links keep «?misto=»", async () => {
    const bucha = await seedCity("bucha", "Буча");
    const shelter = await seedShelter(bucha, {
      verification: PENDING,
      earlyListingSince: daysAgo(2),
    });
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter }), bucha);

    const element = await renderGallery(anonymousRouterClient(h.db), { misto: "bucha" });
    render(<WithMockRouter>{element}</WithMockRouter>);

    expect(screen.getAllByTestId("species-cat")[0]?.getAttribute("href")).toBe(
      "/tvaryny?misto=bucha&vyd=cat",
    );
  });
});
