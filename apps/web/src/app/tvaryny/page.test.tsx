import { animalRepo, cityRepo, shelterRepo } from "@opika/db/repos";
import { makeAnimal, makeCity, makeShelter } from "@opika/db/test";
import { render, screen, within } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { anonymousRouterClient } from "../../api/server-client";
import { createTestHarness, type TestHarness } from "../../api/test-harness";
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

/**
 * The one thing no other test in this branch covers: that `/tvaryny` itself
 * — not `AnimalCard` given fabricated props (AnimalCard.test.tsx), not
 * `gallery.list` in isolation (apps/web/src/api/api.test.ts) — wires a real
 * database through `anonymousRouterClient` to a real render. Same reasoning
 * as `../page.test.tsx`: `force-dynamic` means `next build` never exercises
 * this path, so nothing else does either.
 */
describe("/tvaryny (renderGallery)", () => {
  it("renders a real seeded animal's card with its resolved city name", async () => {
    const city = makeCity({ name: { uk: "Бровари", en: null } });
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      publicLocation: {
        precision: "fuzzed_address",
        cityId: city.id,
        district: null,
        approximate: { center: { lat: 50.51, lng: 30.79 }, precisionMetres: 1000 } as never,
      },
    });
    await shelterRepo(h.db).insert(shelter);
    const animal = makeAnimal({ name: "Мурчик", shelterId: shelter.id });
    await animalRepo(h.db).insert(animal, city.id);

    const element = await renderGallery(anonymousRouterClient(h.db));
    render(<WithMockRouter>{element}</WithMockRouter>);

    // Scoped to the grid: the page around it now carries its own links too
    // (rail chips, sort control, the sheet trigger) — this assertion is
    // about the one animal card, not "the only link on the page."
    const grid = within(screen.getByTestId("gallery-grid"));
    const link = grid.getByRole("link");
    expect(link.getAttribute("href")).toBe(`/tvaryny/${animal.id}`);
    expect(link.getAttribute("aria-label")).toContain("Мурчик");
    expect(screen.getByTestId("card-meta").textContent).toContain("Бровари");
  });

  it("renders the reserved badge for a reserved animal, through the real handler", async () => {
    const city = makeCity();
    await cityRepo(h.db).insert(city);
    const shelter = makeShelter({
      publicLocation: {
        precision: "fuzzed_address",
        cityId: city.id,
        district: null,
        approximate: { center: { lat: 50.51, lng: 30.79 }, precisionMetres: 1000 } as never,
      },
    });
    await shelterRepo(h.db).insert(shelter);
    const publishedAt = new Date("2026-07-01T00:00:00Z");
    const animal = makeAnimal({
      shelterId: shelter.id,
      listing: { kind: "reserved", since: new Date("2026-08-01T00:00:00Z"), publishedAt },
    });
    await animalRepo(h.db).insert(animal, city.id);

    const element = await renderGallery(anonymousRouterClient(h.db));
    render(<WithMockRouter>{element}</WithMockRouter>);

    expect(screen.getByTestId("reserved-badge")).toBeTruthy();
  });

  it("renders an empty grid, not a crash, when nothing is seeded", async () => {
    const element = await renderGallery(anonymousRouterClient(h.db));
    render(<WithMockRouter>{element}</WithMockRouter>);

    // Scoped to the grid for the same reason as above — the rail/sheet/sort
    // controls render their own links regardless of how many animals matched.
    expect(within(screen.getByTestId("gallery-grid")).queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByTestId("gallery-grid")).toBeTruthy();
  });
});
