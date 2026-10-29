import type { FeedCardView } from "@opika/contracts";
import type { AnimalId } from "@opika/domain";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toggleSavedAnimal } from "./likes-store";
import { SavedPageScreen } from "./SavedPageScreen";

const cardsByIds = vi.fn();

// `vi.mock` calls are hoisted above this file's own imports by Vitest's
// transform, so `SavedPageScreen`'s static import of `browser-client` above
// already sees this mock - no dynamic import needed.
vi.mock("../../api/browser-client", () => ({
  savedBrowserClient: {
    animals: { cardsByIds: (...args: unknown[]) => cardsByIds(...args) },
  },
}));

const CITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CITY_NAMES = { [CITY_ID]: "Бровари" };

function makeCard(overrides: Partial<FeedCardView> = {}): FeedCardView {
  return {
    id: "00000001-0000-4000-8000-000000000000" as FeedCardView["id"],
    name: "Мурчик",
    species: "cat",
    sex: "male",
    size: "small",
    ageBucket: "young",
    publicLocation: null,
    primaryPhoto: null,
    freshness: { kind: "fresh", ageDays: 3, confirmedAt: new Date("2026-08-03T12:00:00Z") },
    listingKind: "published",
    shelter: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as FeedCardView["shelter"]["id"],
      displayName: "Тестовий притулок",
      logo: null,
      publicLocation: { cityId: CITY_ID as never },
      verification: "verified",
    },
    ...overrides,
  } as FeedCardView;
}

beforeEach(() => {
  window.localStorage.clear();
  cardsByIds.mockReset();
});

describe("SavedPageScreen", () => {
  it("shows the empty state when nothing is saved", async () => {
    render(<SavedPageScreen cityNames={CITY_NAMES} />);
    expect(await screen.findByTestId("saved-empty")).toBeTruthy();
    expect(screen.getByText(/Тут поки нічого немає/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "До галереї" }).getAttribute("href")).toBe("/tvaryny");
    expect(cardsByIds).not.toHaveBeenCalled();
  });

  it("fetches and shows an available saved animal as a card", async () => {
    toggleSavedAnimal("00000001-0000-4000-8000-000000000000", new Date());
    cardsByIds.mockResolvedValue({
      items: [
        {
          kind: "available",
          animalId: "00000001-0000-4000-8000-000000000000",
          card: makeCard(),
        },
      ],
    });

    render(<SavedPageScreen cityNames={CITY_NAMES} />);

    expect(await screen.findByRole("link", { name: /Мурчик/ })).toBeTruthy();
    expect(cardsByIds).toHaveBeenCalledWith({
      animalIds: ["00000001-0000-4000-8000-000000000000"],
    });
  });

  /**
   * Review of 6825ffd, finding 2: `useSavedCards.ts`'s own comment names the
   * bug this guards - a stale `ids===[]` closure in one effect synchronously
   * setting `items: []` before a sibling effect had set the real (non-empty)
   * ids, so a visitor *with* a save briefly got the wrong empty state. With
   * the old `useState<readonly string[]>([])` default restored in place of
   * `useState<readonly string[] | null>(null)`, this goes red: `saved-empty`
   * is present at the point this asserts it must not be.
   */
  it("never shows the empty state while a saved item's fetch is still pending - only skeletons", async () => {
    toggleSavedAnimal("00000001-0000-4000-8000-000000000000", new Date());
    let resolveFetch!: (value: { items: unknown[] }) => void;
    cardsByIds.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    render(<SavedPageScreen cityNames={CITY_NAMES} />);

    await screen.findByTestId("saved-skeletons");
    expect(screen.getAllByTestId("saved-skeletons").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("saved-empty")).toBeNull();

    resolveFetch({
      items: [
        { kind: "available", animalId: "00000001-0000-4000-8000-000000000000", card: makeCard() },
      ],
    });
    expect(await screen.findByRole("link", { name: /Мурчик/ })).toBeTruthy();
  });

  it("shows an unavailable item with its name, not as a card", async () => {
    toggleSavedAnimal("00000002-0000-4000-8000-000000000000", new Date());
    cardsByIds.mockResolvedValue({
      items: [
        { kind: "unavailable", animalId: "00000002-0000-4000-8000-000000000000", name: "Рекс" },
      ],
    });

    render(<SavedPageScreen cityNames={CITY_NAMES} />);

    expect(await screen.findByText("Рекс більше не показується на сайті.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Рекс/ })).toBeNull();
  });

  it("drops an item with no name at all - nothing honest to show, and no copy to invent (S8-D2)", async () => {
    toggleSavedAnimal("00000003-0000-4000-8000-000000000000", new Date());
    cardsByIds.mockResolvedValue({
      items: [
        { kind: "unavailable", animalId: "00000003-0000-4000-8000-000000000000", name: null },
      ],
    });

    render(<SavedPageScreen cityNames={CITY_NAMES} />);

    expect(await screen.findByTestId("saved-empty")).toBeTruthy();
    expect(screen.queryByTestId("saved-unavailable")).toBeNull();
  });

  it("removing the only saved item empties the page with no second fetch - there is nothing left to ask for", async () => {
    const animalId = "00000001-0000-4000-8000-000000000000" as AnimalId;
    toggleSavedAnimal(animalId, new Date());
    cardsByIds.mockResolvedValue({
      items: [{ kind: "available", animalId, card: makeCard() }],
    });

    render(<SavedPageScreen cityNames={CITY_NAMES} />);
    await screen.findByRole("link", { name: /Мурчик/ });
    expect(cardsByIds).toHaveBeenCalledTimes(1);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("saved-remove"));

    expect(await screen.findByTestId("saved-empty")).toBeTruthy();
    // No network call for an empty list - nothing to resolve.
    expect(cardsByIds).toHaveBeenCalledTimes(1);
  });

  it("removing one of several saved items re-fetches the rest", async () => {
    const first = "00000001-0000-4000-8000-000000000000" as AnimalId;
    const second = "00000002-0000-4000-8000-000000000000" as AnimalId;
    toggleSavedAnimal(second, new Date("2026-10-20T00:00:00.000Z"));
    toggleSavedAnimal(first, new Date("2026-10-21T00:00:00.000Z"));
    cardsByIds.mockResolvedValue({
      items: [
        { kind: "available", animalId: first, card: makeCard({ id: first }) },
        { kind: "available", animalId: second, card: makeCard({ id: second, name: "Рекс" }) },
      ],
    });

    render(<SavedPageScreen cityNames={CITY_NAMES} />);
    await screen.findByRole("link", { name: /Мурчик/ });
    expect(cardsByIds).toHaveBeenLastCalledWith({ animalIds: [first, second] });

    cardsByIds.mockResolvedValue({
      items: [
        { kind: "available", animalId: second, card: makeCard({ id: second, name: "Рекс" }) },
      ],
    });
    const user = userEvent.setup();
    await user.click(screen.getAllByTestId("saved-remove")[0] as HTMLElement);

    await waitFor(() => expect(cardsByIds).toHaveBeenLastCalledWith({ animalIds: [second] }));
  });

  it("shows the storage-blocked notice when localStorage threw", async () => {
    const getItemSpy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    cardsByIds.mockResolvedValue({ items: [] });

    render(<SavedPageScreen cityNames={CITY_NAMES} />);

    expect(await screen.findByTestId("saved-storage-blocked")).toBeTruthy();
    getItemSpy.mockRestore();
  });
});

describe("SavedPageScreen – landmarks", () => {
  it("puts the page title in the main landmark", () => {
    render(<SavedPageScreen cityNames={CITY_NAMES} />);

    const main = screen.getByRole("main");
    expect(main.querySelector("h1")).not.toBeNull();
  });
});
