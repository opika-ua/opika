import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import {
  type AnimalSpecies,
  type CityId,
  NO_FILTERS,
  type ShelterVerification,
} from "@opika/domain";
import { render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonymousRouterClient } from "../../../../api/server-client";
import { createTestHarness, type TestHarness } from "../../../../api/test-harness";
import { loadCityPage } from "../../../../features/gallery/city-page-load";
import { SPECIES_PAGE_MIN_ANIMALS } from "../../../../features/gallery/species-pages";
import { WithMockRouter } from "../../../../features/gallery/test-router";
import { loadShelterPage } from "../../../../features/shelters/shelter-page-load";
import { buildSitemapEntries } from "../../../../seo/sitemap-entries";
import { renderShelterPage } from "../../../prytulky/[shelterId]/page";
import { galleryCanonicalOf, readGallery, renderGallery } from "../../page";
import Page, { renderSpeciesPage } from "./page";

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
const UNDER_REVIEW: ShelterVerification = {
  status: "pending",
  submittedAt: daysAgo(3),
  evidence: { items: [], submittedAt: daysAgo(30) },
};

async function seedCity(slug: string) {
  const city = makeCity({ slug: slug as never });
  await cityRepo(h.db).insert(city);
  return city.id;
}

async function seedShelter(cityId: CityId, extra: Parameters<typeof makeShelter>[0] = {}) {
  const shelter = makeShelter({
    publicLocation: {
      precision: "fuzzed_address",
      cityId,
      district: null,
      approximate: { center: { lat: 50.45, lng: 30.52 }, precisionMetres: 1000 } as never,
    },
    ...extra,
  });
  await shelterRepo(h.db).insert(shelter);
  return shelter.id;
}

async function seedAnimals(
  shelterId: Awaited<ReturnType<typeof seedShelter>>,
  cityId: CityId,
  species: AnimalSpecies,
  count: number,
) {
  await animalRepo(h.db).insertMany(
    Array.from({ length: count }, () => ({ animal: makeAnimal({ shelterId, species }), cityId })),
  );
}

/**
 * Kyiv: `dogs` dogs of a verified shelter, and three more of a shelter under review, which are in
 * the gallery but never count towards the threshold. Two cats, so the cat page never exists.
 */
async function kyivWithDogs(dogs: number) {
  const kyiv = await seedCity("kyiv");
  const verified = await seedShelter(kyiv);
  const underReview = await seedShelter(kyiv, {
    verification: UNDER_REVIEW,
    earlyListingSince: daysAgo(2),
  });
  await seedAnimals(verified, kyiv, "dog", dogs);
  await seedAnimals(underReview, kyiv, "dog", 3);
  await seedAnimals(verified, kyiv, "cat", 2);
  return { kyiv, verified };
}

const client = () => anonymousRouterClient(h.db);
const isNotFound = (error: unknown) =>
  error instanceof Error &&
  "digest" in error &&
  String((error as { digest: unknown }).digest).includes("404");
const speciesPageLinks = (container: HTMLElement) =>
  [...container.querySelectorAll("a")]
    .map((link) => link.getAttribute("href") ?? "")
    .filter((href) => href.startsWith("/tvaryny/vyd/"));

describe("/tvaryny/vyd/{slug}: a page only with enough indexable animals", () => {
  it("is a 404 one below the threshold, an under-review shelter's dogs not counted", async () => {
    await kyivWithDogs(SPECIES_PAGE_MIN_ANIMALS - 1);
    expect(await readGallery(client(), {}, { species: "dog" })).toEqual({ kind: "not_found" });
    await expect(renderGallery(client(), {}, false, { species: "dog" })).rejects.toSatisfy(
      isNotFound,
    );
  });

  it("answers at the threshold with «Собаки шукають дім» and only dogs in its grid", async () => {
    await kyivWithDogs(SPECIES_PAGE_MIN_ANIMALS);
    const reads = await readGallery(client(), { vyd: "cat" }, { species: "dog" });
    // The path fixes the species; the query's own «vyd» is ignored.
    expect(reads.kind === "reads" && reads.filters.species).toEqual({
      kind: "oneOf",
      values: ["dog"],
    });
    render(
      <WithMockRouter>
        {await renderGallery(client(), { vyd: "cat" }, false, { species: "dog" }, reads)}
      </WithMockRouter>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Собаки шукають дім" })).toBeTruthy();
  });

  it("carries a BreadcrumbList: gallery, then the species page under its own heading", async () => {
    await kyivWithDogs(SPECIES_PAGE_MIN_ANIMALS);
    const reads = await readGallery(client(), {}, { species: "dog" });
    const { container } = render(
      <WithMockRouter>{await renderSpeciesPage(client(), "dog", {}, false, reads)}</WithMockRouter>,
    );
    const lists = [...container.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent ?? ""))
      .filter((entry) => entry["@type"] === "BreadcrumbList");
    expect(lists).toHaveLength(1);
    const items: { position: number; name: string; item: string }[] = lists[0].itemListElement;
    expect(items.map((i) => i.position)).toEqual([1, 2]);
    expect(items.map((i) => new URL(i.item).pathname)).toEqual(["/", "/tvaryny/vyd/sobaky"]);
    expect(items[1]?.name).toBe("Собаки шукають дім");
  });

  it("an unknown slug is a 404 before anything is read", async () => {
    await expect(
      Page({ params: Promise.resolve({ slug: "khomiaky" }), searchParams: Promise.resolve({}) }),
    ).rejects.toSatisfy(isNotFound);
  });
});

describe("the canonical of a one-species gallery", () => {
  const canonicalOf = async (searchParams: Record<string, string>) =>
    galleryCanonicalOf(await readGallery(client(), searchParams));

  it("/?vyd=dog is the species page when it exists, «/» when it does not", async () => {
    const { kyiv, verified } = await kyivWithDogs(SPECIES_PAGE_MIN_ANIMALS - 1);
    expect(await canonicalOf({ vyd: "dog" })).toBe("/");

    await seedAnimals(verified, kyiv, "dog", 1);
    expect(await canonicalOf({ vyd: "dog" })).toBe("/tvaryny/vyd/sobaky");
    expect(await canonicalOf({ vyd: "dog", vik: "adult", sort: "longest_waiting" })).toBe(
      "/tvaryny/vyd/sobaky",
    );
    // Two species, or the cats below the threshold: the gallery's own canonical, as before.
    expect(await canonicalOf({ vyd: "dog,cat" })).toBe("/");
    expect(await canonicalOf({ vyd: "cat" })).toBe("/");
  });

  it("keeps the page number, and the city rule wins over the species rule", async () => {
    await kyivWithDogs(25);
    // Bucha's only shelter is under review: no city page, so the species page takes it.
    const bucha = await seedCity("bucha");
    const early = await seedShelter(bucha, {
      verification: UNDER_REVIEW,
      earlyListingSince: daysAgo(2),
    });
    await seedAnimals(early, bucha, "dog", 1);

    expect(await canonicalOf({ vyd: "dog", stor: "2" })).toBe("/tvaryny/vyd/sobaky?stor=2");
    expect(await canonicalOf({ vyd: "dog", misto: "kyiv" })).toBe("/tvaryny/misto/kyiv");
    expect(await canonicalOf({ vyd: "dog", misto: "bucha" })).toBe("/tvaryny/vyd/sobaky");
    // The species page itself: self-canonical, the query's own «vyd» ignored.
    const own = await readGallery(client(), { vyd: "cat", stor: "2" }, { species: "dog" });
    expect(galleryCanonicalOf(own)).toBe("/tvaryny/vyd/sobaky?stor=2");
  });
});

describe("links to a species page: only while it exists, and only as real <a> links", () => {
  it("below the threshold no gallery, city page or shelter page links to it", async () => {
    const { verified } = await kyivWithDogs(SPECIES_PAGE_MIN_ANIMALS - 1);
    const gallery = render(
      <WithMockRouter>{await renderGallery(client(), { vyd: "dog" })}</WithMockRouter>,
    );
    expect(speciesPageLinks(gallery.container)).toEqual([]);
    expect(screen.getAllByTestId("species-dog")[0]?.getAttribute("href")).toBe("/");
    gallery.unmount();

    const city = await loadCityPage("kyiv", client());
    if (city.kind !== "city") throw new Error(`expected the city, got ${city.kind}`);
    const cityPage = render(
      <WithMockRouter>
        {await renderGallery(client(), {}, false, { city: city.city })}
      </WithMockRouter>,
    );
    expect(speciesPageLinks(cityPage.container)).toEqual([]);
    cityPage.unmount();

    await expectShelterPageWithoutSpeciesLinks(verified);
  });

  it("at the threshold the gallery's switch links to /tvaryny/vyd/sobaky with an <a>", async () => {
    const { verified } = await kyivWithDogs(SPECIES_PAGE_MIN_ANIMALS);
    render(<WithMockRouter>{await renderGallery(client(), {})}</WithMockRouter>);
    for (const link of screen.getAllByTestId("species-dog")) {
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe("/tvaryny/vyd/sobaky");
    }
    // The cats stay below it: their segment keeps the query.
    expect(screen.getAllByTestId("species-cat")[0]?.getAttribute("href")).toBe("/?vyd=cat");

    // A shelter page keeps its own address, whatever the counts.
    await expectShelterPageWithoutSpeciesLinks(verified);
  });

  it("on the species page its filters stay there, and «all» leaves for the gallery", async () => {
    await kyivWithDogs(SPECIES_PAGE_MIN_ANIMALS);
    render(
      <WithMockRouter>
        {await renderGallery(client(), { vik: "adult" }, false, { species: "dog" })}
      </WithMockRouter>,
    );
    expect(screen.getAllByTestId("species-dog")[0]?.getAttribute("href")).toBe("/?vik=adult");
    expect(screen.getAllByTestId("species-any")[0]?.getAttribute("href")).toBe("/?vik=adult");
    expect(screen.getAllByTestId("species-cat")[0]?.getAttribute("href")).toBe(
      "/?vyd=cat&vik=adult",
    );
  });
});

async function expectShelterPageWithoutSpeciesLinks(shelterId: string) {
  const load = await loadShelterPage(
    shelterId,
    { sort: "freshest", page: 1, filters: NO_FILTERS },
    client(),
  );
  const shelterPage = render(<WithMockRouter>{renderShelterPage(load, false)}</WithMockRouter>);
  expect(speciesPageLinks(shelterPage.container)).toEqual([]);
  shelterPage.unmount();
}

describe("the sitemap names exactly the species pages that answer 200", () => {
  it("the dog page at the threshold, never the cat page below it", async () => {
    await kyivWithDogs(SPECIES_PAGE_MIN_ANIMALS);
    const counts = await client().gallery.facetCounts({ filters: NO_FILTERS });
    const entries = await buildSitemapEntries(true, {
      animals: async () => [],
      cities: async () => [],
      speciesCounts: async () => counts.indexableBySpecies,
    });
    const listed = entries
      .map((entry) => new URL(entry.url).pathname)
      .filter((path) => path.startsWith("/tvaryny/vyd/"));
    expect(listed).toEqual(["/tvaryny/vyd/sobaky"]);

    const answers = async (species: AnimalSpecies) =>
      (await readGallery(client(), {}, { species })).kind === "reads";
    expect(await answers("dog")).toBe(true);
    expect(await answers("cat")).toBe(false);
  });
});
