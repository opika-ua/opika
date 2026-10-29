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
 * - not `AnimalCard` given fabricated props (AnimalCard.test.tsx), not
 * `gallery.list` in isolation (apps/web/src/api/api.test.ts) - wires a real
 * database through `anonymousRouterClient` to a real render. Same reasoning
 * as `../page.test.tsx`: `force-dynamic` means `next build` never exercises
 * this path, so nothing else does either.
 */
describe("/tvaryny (renderGallery)", () => {
  it("renders a real seeded animal's card with its resolved city name", async () => {
    const city = makeCity({
      name: { uk: "Бровари", en: { text: "Brovary", provenance: "human" } },
    });
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
    // (dropdown options, the sort toggle, the sheet trigger) - this
    // assertion is about the one animal card, not "the only link on the
    // page."
    const grid = within(screen.getByTestId("gallery-grid"));
    const link = grid.getByRole("link");
    expect(link.getAttribute("href")).toBe(`/tvaryny/${animal.id}`);
    expect(link.getAttribute("aria-label")).toContain("Мурчик");
    // gallery-v3 (Figma `58:1617`): the card's visible meta line no longer
    // shows city at all (sex · age · size only) - city stays in the
    // accessible name, which this is the real-handler proof of.
    expect(link.getAttribute("aria-label")).toContain("Бровари");
    expect(screen.getByTestId("card-meta").textContent).not.toContain("Бровари");
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
      listing: {
        kind: "reserved",
        since: new Date("2026-08-01T00:00:00Z"),
        publishedAt,
        confirmedAt: publishedAt,
        undoable: null,
      },
    });
    await animalRepo(h.db).insert(animal, city.id);

    const element = await renderGallery(anonymousRouterClient(h.db));
    render(<WithMockRouter>{element}</WithMockRouter>);

    expect(screen.getByTestId("reserved-badge")).toBeTruthy();
  });

  /**
   * V2 repoint: this used to assert "an empty grid, not a crash" - the E4
   * no-match state had no mock yet, so an empty `<main>` was the honest
   * placeholder. docs/design/README.md's "Gallery states" > "No match" now
   * has one (`Opika Registry System.dc.html`'s B4 frame), built as
   * `NoMatch.tsx` and wired in here - the design value that changed is the
   * whole rendered branch, "empty grid" -> "the no-match card", not a
   * colour or a class.
   */
  it("renders the no-match state, not an empty grid, when nothing is seeded", async () => {
    const element = await renderGallery(anonymousRouterClient(h.db));
    render(<WithMockRouter>{element}</WithMockRouter>);

    expect(screen.queryByTestId("gallery-grid")).toBeNull();
    expect(screen.getByTestId("gallery-no-match")).toBeTruthy();
    expect(screen.getByText("Під ці фільтри зараз нікого немає.")).toBeTruthy();
  });

  /**
   * Oleksii, mid-build, verbatim: "let's hide access to Гортати по одній
   * page for now as well." The deck entry link is gone from this page
   * entirely - not conditional on match count or sign-in anymore, so this
   * collapses the three tests that used to check it under each of those
   * conditions into one: it is simply never there. The deck route itself
   * (`/tvaryny/gortaty`) is untouched; only this page's link to it is gone.
   */
  it("never renders a deck entry control, with or without matches", async () => {
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
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter.id }), city.id);

    const element = await renderGallery(anonymousRouterClient(h.db));
    render(<WithMockRouter>{element}</WithMockRouter>);

    expect(screen.queryByText("Гортати по одній")).toBeNull();
    expect(screen.queryByText("Гортати")).toBeNull();
  });

  it("kabinetSignedIn=true still shows «Кабінет», not «Збережені», in the header", async () => {
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
    await animalRepo(h.db).insert(makeAnimal({ shelterId: shelter.id }), city.id);

    const element = await renderGallery(anonymousRouterClient(h.db), {}, true);
    render(<WithMockRouter>{element}</WithMockRouter>);

    expect(screen.getByRole("link", { name: "Кабінет" }).getAttribute("href")).toBe("/kabinet");
    expect(screen.queryByRole("link", { name: "Збережені" })).toBeNull();
  });
});

/**
 * The visible D-2 demo disclosure banner this describe block used to cover
 * (`gallery-demo-banner`) is removed from this page - Oleksii, mid-build,
 * verbatim: "remove На сайті поки немає справжніх притулків — усі картки
 * тут демонстраційні. as we hide our app anyways and people without gate
 * cant access it ye[t]." Deleted, not weakened: there is no banner left to
 * assert the presence or absence of. The `og:description`/`description`
 * metadata swap (root `app/layout.tsx`, gated on the same
 * `REGISTRY_HAS_NO_REAL_SHELTERS` flag) is untouched and still covered by
 * `seo-flags.test.ts`.
 */

/**
 * A hand-edited place param must degrade to "no filter", as it did before the token lookup existed,
 * never reach the contract as an invalid input and land on the error page. (The deck and the
 * overlay read the same `cityTokensOf`, whose unit test is in `filter-url.test.ts`.)
 */
describe("/tvaryny (renderGallery) with a malformed place param", () => {
  it.each([
    ["an empty value", { misto: "" }],
    ["a trailing comma", { misto: "unknown-city," }],
    ["an empty token between commas", { misto: "a,,b" }],
    ["a token over the length cap", { misto: "a".repeat(101) }],
    [
      "more tokens than the cap",
      { misto: Array.from({ length: 45 }, (_, i) => `p${i}`).join(",") },
    ],
    [
      "more oblast tokens than exist",
      { obl: Array.from({ length: 40 }, (_, i) => `r${i}`).join(",") },
    ],
  ])("renders for %s", async (_what, params) => {
    const element = await renderGallery(anonymousRouterClient(h.db), params);
    render(<WithMockRouter>{element}</WithMockRouter>);
    expect(screen.getByTestId("gallery-no-match")).toBeTruthy();
  });
});
