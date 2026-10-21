import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANIMAL_ID,
  type ByIdBehaviour,
  stubAnimalPageClient,
} from "../../features/animal-detail/test-fixtures";
import { WithMockRouter } from "../../features/gallery/test-router";
import { renderAnimalOverlay } from "./@preview/(.)[animalId]/page";
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

describe("the full page", () => {
  it("RATE_LIMITED shows his sentence and nothing that says the card is gone", async () => {
    await renderPage({ kind: "refuse", code: "RATE_LIMITED" });
    expect(screen.getByRole("heading", { level: 1, name: HIS_SENTENCE })).toBeTruthy();
    expect(screen.queryByText(new RegExp(NOT_FOUND_CLAIM))).toBeNull();
    expect(screen.queryByText(NOT_FOUND_TITLE)).toBeNull();
    expect(screen.getByRole("link", { name: "Усі тварини" }).getAttribute("href")).toBe("/tvaryny");
  });

  it("RATE_LIMITED is kept out of search results", async () => {
    current = stubAnimalPageClient({ kind: "refuse", code: "RATE_LIMITED" });
    expect((await generateMetadata({ params })).robots).toEqual({ index: false, follow: false });
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
