import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANIMAL_ID,
  type ByIdBehaviour,
  makeDetailAnimal,
  stubAnimalPageClient,
} from "../../features/animal-detail/test-fixtures";
import { WithMockRouter } from "../../features/gallery/test-router";
import { renderAnimalOverlay } from "./@preview/(.)[animalId]/page";
import { metadata as notFoundMetadata } from "./[animalId]/not-found";
import AnimalPage, { generateMetadata } from "./[animalId]/page";

/**
 * `/tvaryny/{id}` on both of its surfaces, the full page and the gallery's
 * overlay, each through its real route module with `animals.byId` stubbed
 * (RL-F1). His words, verbatim (2026-10-20): the rate-limited case gets
 * "its own state on both the full page and the drawer, using the existing
 * «Забагато запитів. Спробуйте ще раз пізніше.». It never shows «Це не
 * помилка…» for a rate limit." The sentences below are transcribed from
 * his messages and the 404's shipped copy, not read from the catalogue.
 */
const HIS_SENTENCE = "Забагато запитів. Спробуйте ще раз пізніше.";
const NOT_FOUND_TITLE = "Цієї картки більше немає.";
const NOT_FOUND_CLAIM = "Це не помилка";

let current = stubAnimalPageClient();
vi.mock("../../api/server-client", () => ({ anonymousRouterClient: () => current.client }));
vi.mock("../../api/browser-client", () => ({
  revealBrowserClient: { session: { bootstrap: vi.fn() }, animals: { reveal: vi.fn() } },
}));

const params = Promise.resolve({ animalId: ANIMAL_ID });

async function renderPage(byId: ByIdBehaviour) {
  current = stubAnimalPageClient(byId);
  render(<WithMockRouter>{await AnimalPage({ params })}</WithMockRouter>);
}

async function renderOverlay(byId: ByIdBehaviour) {
  current = stubAnimalPageClient(byId);
  render(<WithMockRouter>{await renderAnimalOverlay(ANIMAL_ID)}</WithMockRouter>);
  return screen.getByRole("dialog");
}

beforeEach(() => {
  document.body.style.overflow = "";
});

it("the not-found page is noindex (PR B, the SEO review of page titles)", () => {
  expect(notFoundMetadata.robots).toEqual({ index: false, follow: false });
});

describe("the full page", () => {
  it("RATE_LIMITED shows his sentence and nothing that says the card is gone", async () => {
    await renderPage({ kind: "refuse", code: "RATE_LIMITED" });
    expect(screen.getByRole("heading", { level: 1, name: HIS_SENTENCE })).toBeTruthy();
    expect(screen.queryByText(new RegExp(NOT_FOUND_CLAIM))).toBeNull();
    expect(screen.queryByText(NOT_FOUND_TITLE)).toBeNull();
    expect(screen.getByRole("link", { name: "Усі тварини" }).getAttribute("href")).toBe("/");
  });

  it("RATE_LIMITED is kept out of search results", async () => {
    current = stubAnimalPageClient({ kind: "refuse", code: "RATE_LIMITED" });
    expect((await generateMetadata({ params })).robots).toEqual({ index: false, follow: false });
  });

  describe("metadata (SEO handoff B2, owner-approved 2026-11-18)", () => {
    const titleOf = async (animal: Parameters<typeof makeDetailAnimal>[0]) => {
      current = stubAnimalPageClient({ kind: "answer", animal: makeDetailAnimal(animal) });
      return (await generateMetadata({ params })).title;
    };

    it("title is «{Name} – {noun} шукає дім, {city} – Opika»: no age bucket, no listing state", async () => {
      current = stubAnimalPageClient();
      expect((await generateMetadata({ params })).title).toEqual({
        absolute: "Мурчик – кіт шукає дім, Бровари – Opika",
      });
    });

    it.each([
      ["a male dog", { species: "dog", sex: "male", ageBucket: "adult" }, "собака"],
      ["a female cat", { species: "cat", sex: "female", ageBucket: "adult" }, "кішка"],
      ["a puppy", { species: "dog", sex: "female", ageBucket: "baby" }, "цуценя"],
      ["a kitten", { species: "cat", sex: "male", ageBucket: "baby" }, "кошеня"],
    ] as const)("the noun for %s is «%s»", async (_who, animal, noun) => {
      expect(await titleOf(animal)).toEqual({
        absolute: `Мурчик – ${noun} шукає дім, Бровари – Opika`,
      });
    });

    it("the description is the name, the city, the shelter and the story's first sentence", async () => {
      current = stubAnimalPageClient();
      const { description } = await generateMetadata({ params });
      expect(description).toMatch(
        /^Мурчик шукає дім\. Бровари · .+\. Лагідний кіт, любить сидіти на підвіконні\.$/u,
      );
    });

    it("a city that doesn't resolve takes the owner's no-city title and description (2026-11-18)", async () => {
      // The animal's own location, not the shelter's, wins when both are set (`loadAnimalPage`'s
      // order): a city id absent from the stub's one-city `cities.byIds` is `cityName: null`.
      current = stubAnimalPageClient({
        kind: "answer",
        animal: makeDetailAnimal({ publicLocation: { cityId: "unknown-city-id" as never } }),
      });
      const metadata = await generateMetadata({ params });
      expect(metadata.title).toEqual({ absolute: "Мурчик – кіт шукає дім – Opika" });
      expect(metadata.description).toMatch(
        /^Мурчик шукає дім\. [^·]+\. Лагідний кіт, любить сидіти на підвіконні\.$/u,
      );
      expect(metadata.openGraph).toMatchObject({ title: "Мурчик – кіт шукає дім – Opika" });
    });

    it("canonical is always the bare id, never a query string", async () => {
      current = stubAnimalPageClient();
      expect((await generateMetadata({ params })).alternates?.canonical).toBe(
        `/tvaryny/${ANIMAL_ID}`,
      );
    });

    /**
     * Found on review: the test above can't actually distinguish "built from `animal.id`"
     * from "built from the raw route param" - they're the same string. `AnimalIdSchema`
     * is `z.uuid().brand(...)`, which validates format but never normalises case, so an
     * uppercase URL reaches this far unchanged; the loaded animal's own `id` is still the
     * canonical lowercase form. The canonical must follow the latter.
     */
    it("canonical uses the animal's own id, not an uppercase route param", async () => {
      current = stubAnimalPageClient();
      const uppercaseParams = Promise.resolve({ animalId: ANIMAL_ID.toUpperCase() });
      expect((await generateMetadata({ params: uppercaseParams })).alternates?.canonical).toBe(
        `/tvaryny/${ANIMAL_ID}`,
      );
    });

    it("Open Graph and Twitter carry the page's own title and description (B2)", async () => {
      current = stubAnimalPageClient();
      const metadata = await generateMetadata({ params });
      const title = "Мурчик – кіт шукає дім, Бровари – Opika";
      expect(metadata.openGraph).toMatchObject({ title, description: metadata.description });
      expect(metadata.twitter).toEqual({
        card: "summary_large_image",
        title,
        description: metadata.description,
      });
    });

    it("sets no image by hand: the sibling opengraph-image route supplies it (BR-7)", async () => {
      current = stubAnimalPageClient();
      const metadata = await generateMetadata({ params });
      expect(metadata.openGraph).not.toHaveProperty("images");
      expect(metadata.twitter).not.toHaveProperty("images");
    });

    // The description's own demo/real branches (by `REGISTRY_HAS_NO_REAL_SHELTERS`) are
    // covered in `seo-flags.test.ts`'s own describe block for this route, which also
    // varies `SITE_IS_PUBLICLY_DISCOVERABLE` independently - duplicating a narrower
    // version of the same two cases here added no coverage, found on review.
  });

  it("NOT_FOUND is still the 404", async () => {
    current = stubAnimalPageClient({ kind: "refuse", code: "NOT_FOUND" });
    await expect(AnimalPage({ params })).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });

  it("any other error goes to the error boundary, not the 404", async () => {
    current = stubAnimalPageClient({ kind: "fail" });
    await expect(AnimalPage({ params })).rejects.toThrow("connection terminated");
  });

  it("an answer renders the animal", async () => {
    await renderPage({ kind: "answer" });
    expect(screen.getByRole("heading", { level: 1, name: "Мурчик" })).toBeTruthy();
  });
});

/** The owner's approved strings (2026-11-24), transcribed rather than read from the catalogue. */
const HOME_FOUND_TITLE = "Мурчик уже вдома";
const HOME_FOUND_BODY = "Ця тварина вже знайшла родину. Інші ще чекають на свій дім.";

describe("«Уже вдома»: an adoption under 90 days old", () => {
  it("the page shows the photo, the title, the line and the gallery link, and nothing to act on", async () => {
    await renderPage({ kind: "home_found" });
    expect(screen.getByRole("heading", { level: 1, name: HOME_FOUND_TITLE })).toBeTruthy();
    expect(screen.getByText(HOME_FOUND_BODY)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Мурчик" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Усі тварини" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("contentinfo")).toBeTruthy();
    expect(screen.queryByTestId("reveal-trigger")).toBeNull();
    expect(screen.queryByRole("button", { name: /звʼязатися|контакт/i })).toBeNull();
    expect(screen.queryByText(NOT_FOUND_TITLE)).toBeNull();
  });

  it("the title is «{name} уже вдома – Opika», and the page is noindex, follow", async () => {
    current = stubAnimalPageClient({ kind: "home_found" });
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toEqual({ absolute: "Мурчик уже вдома – Opika" });
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toBeUndefined();
  });

  it("the overlay shows the same state, named by its title, without the gallery link", async () => {
    const dialog = await renderOverlay({ kind: "home_found" });
    expect(screen.getByRole("dialog", { name: HOME_FOUND_TITLE })).toBe(dialog);
    expect(within(dialog).getByRole("heading", { name: HOME_FOUND_TITLE })).toBeTruthy();
    expect(within(dialog).getByText(HOME_FOUND_BODY)).toBeTruthy();
    expect(within(dialog).queryByTestId("reveal-trigger")).toBeNull();
    expect(within(dialog).queryByText(NOT_FOUND_TITLE)).toBeNull();
  });
});

describe("the gallery's overlay", () => {
  it("RATE_LIMITED shows his sentence and nothing that says the card is gone", async () => {
    const dialog = await renderOverlay({ kind: "refuse", code: "RATE_LIMITED" });
    expect(dialog.getAttribute("aria-label")).toBe(HIS_SENTENCE);
    expect(within(dialog).getByRole("heading", { name: HIS_SENTENCE })).toBeTruthy();
    expect(within(dialog).queryByText(new RegExp(NOT_FOUND_CLAIM))).toBeNull();
    expect(within(dialog).queryByText(NOT_FOUND_TITLE)).toBeNull();
  });

  it("NOT_FOUND is the 404's copy, inside the overlay", async () => {
    const dialog = await renderOverlay({ kind: "refuse", code: "NOT_FOUND" });
    expect(within(dialog).getByRole("heading", { name: NOT_FOUND_TITLE })).toBeTruthy();
  });

  it("any other error says the page didn't load, not that the card is gone", async () => {
    const dialog = await renderOverlay({ kind: "fail" });
    expect(
      within(dialog).getByRole("heading", { name: "Сторінку не вдалося завантажити." }),
    ).toBeTruthy();
    expect(within(dialog).queryByText(new RegExp(NOT_FOUND_CLAIM))).toBeNull();
    expect(within(dialog).queryByText(NOT_FOUND_TITLE)).toBeNull();
  });

  it("an answer renders the animal page inside the dialog, named after the animal", async () => {
    const dialog = await renderOverlay({ kind: "answer" });
    expect(screen.getByRole("dialog", { name: "Мурчик" })).toBe(dialog);
    expect(within(dialog).getByRole("heading", { level: 1, name: "Мурчик" })).toBeTruthy();
  });

  it("a path that isn't an animal id opens no overlay", async () => {
    current = stubAnimalPageClient();
    expect(await renderAnimalOverlay("gortaty")).toBeNull();
    expect(current.animalsById).not.toHaveBeenCalled();
  });
});
