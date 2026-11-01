import type { FeedCardView } from "@opika/contracts";
import type { AnimalId } from "@opika/domain";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readLikesStore, resetLikesStoreMemoryForTests, toggleSavedAnimal } from "./likes-store";
import { SavedPageScreen } from "./SavedPageScreen";

const cardsByIds = vi.fn();

vi.mock("../../api/browser-client", () => ({
  savedBrowserClient: {
    animals: { cardsByIds: (...args: unknown[]) => cardsByIds(...args) },
  },
}));

const CITY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A = "00000001-0000-4000-8000-000000000000" as AnimalId;
const B = "00000002-0000-4000-8000-000000000000" as AnimalId;
const C = "00000003-0000-4000-8000-000000000000" as AnimalId;
const NAMES: Record<string, string> = { [A]: "Мурчик", [B]: "Рекс", [C]: "Барсик" };
const REMOVE = "Прибрати зі збережених";

function makeCard(id: AnimalId): FeedCardView {
  return {
    id,
    name: NAMES[id],
    species: "cat",
    sex: "male",
    size: "small",
    ageBucket: "young",
    publicLocation: null,
    primaryPhoto: null,
    freshness: { kind: "fresh", ageDays: 3, confirmedAt: new Date("2026-08-03T12:00:00Z") },
    listingKind: "published",
    shelter: {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      displayName: "Тестовий притулок",
      logo: null,
      publicLocation: { cityId: CITY_ID },
      verification: "verified",
    },
  } as unknown as FeedCardView;
}

// Saved in this order, so the page (newest first) lists C, B, A.
function saveAll(ids: readonly AnimalId[]) {
  ids.forEach((id, at) => {
    toggleSavedAnimal(id, new Date(2026, 9, 20 + at));
  });
}

function respond(ids: readonly AnimalId[]) {
  cardsByIds.mockResolvedValue({
    cityLabels: [],
    items: ids.map((id) => ({ kind: "available", animalId: id, card: makeCard(id) })),
  });
}

const order = () => screen.getAllByTestId("card-name").map((node) => node.textContent ?? "");
const headerLabel = () => screen.getByTestId("nav-saved").getAttribute("aria-label");
const storedIds = () => readLikesStore().items.map((item) => item.animalId);
const bookmarks = () => screen.getAllByRole("button", { name: REMOVE });
const bookmarkOf = (name: RegExp) =>
  within(screen.getByRole("link", { name }).parentElement as HTMLElement).getByRole("button", {
    name: REMOVE,
  });
const announced = (text: string) =>
  screen.getAllByRole("status").some((node) => node.textContent === text);

function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  resetLikesStoreMemoryForTests();
  window.localStorage.clear();
  cardsByIds.mockReset();
  stubReducedMotion(false);
  saveAll([A, B, C]);
  respond([C, B, A]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("saved page – the remove bookmark", () => {
  it("each card has one bookmark named «Прибрати зі збережених»; the old text pill is gone", async () => {
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Барсик/ });
    expect(bookmarks()).toHaveLength(3);
    expect(screen.queryByText("Прибрати зі списку")).toBeNull();
  });

  it("removing writes the store and the header count at once, shows the toast and announces it", async () => {
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Барсик/ });
    expect(headerLabel()).toBe("Збережені, 3");

    await userEvent.click(bookmarkOf(/Рекс/));

    expect(headerLabel()).toBe("Збережені, 2");
    expect(storedIds()).toEqual([C, A]);
    expect(screen.getByText("Прибрано зі збережених")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Повернути" })).toBeTruthy();
    expect(announced("Рекс: прибрано зі збережених")).toBe(true);
    await waitFor(() => expect(order()).toEqual(["Барсик", "Мурчик"]));
  });

  it("«Повернути» puts the card back in the same position, with no new request", async () => {
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Барсик/ });
    await userEvent.click(bookmarkOf(/Рекс/));
    await waitFor(() => expect(order()).toEqual(["Барсик", "Мурчик"]));

    await userEvent.click(screen.getByRole("button", { name: "Повернути" }));

    expect(order()).toEqual(["Барсик", "Рекс", "Мурчик"]);
    expect(storedIds()).toEqual([C, B, A]);
    expect(headerLabel()).toBe("Збережені, 3");
    expect(screen.queryByRole("button", { name: "Повернути" })).toBeNull();
    expect(announced("Рекс: додано до збережених")).toBe(true);
    expect(cardsByIds).toHaveBeenCalledTimes(1);
  });

  it("the last card removed gives the empty state with the toast still shown, and undo brings the card back", async () => {
    window.localStorage.clear();
    resetLikesStoreMemoryForTests();
    saveAll([A]);
    respond([A]);
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Мурчик/ });

    await userEvent.click(screen.getByRole("button", { name: REMOVE }));

    expect(await screen.findByTestId("saved-empty")).toBeTruthy();
    expect(screen.getByText("Прибрано зі збережених")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Повернути" })).toBeTruthy();
    // Focus is not lost to the body: it lands on the empty state's text.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByText(/Тут поки нічого немає/)),
    );

    await userEvent.click(screen.getByRole("button", { name: "Повернути" }));
    expect(await screen.findByRole("link", { name: /Мурчик/ })).toBeTruthy();
    expect(screen.queryByTestId("saved-empty")).toBeNull();
  });

  it("works from the keyboard: Enter and Space remove, focus moves on, the toast action is reached by Tab", async () => {
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Барсик/ });
    const user = userEvent.setup();

    (bookmarks()[0] as HTMLElement).focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(order()).toEqual(["Рекс", "Мурчик"]));
    expect(document.activeElement).toBe(bookmarkOf(/Рекс/));

    await user.keyboard(" ");
    await waitFor(() => expect(order()).toEqual(["Мурчик"]));
    expect(document.activeElement).toBe(bookmarkOf(/Мурчик/));

    for (let step = 0; step < 12; step++) {
      if (document.activeElement?.textContent === "Повернути") break;
      await user.tab();
    }
    expect(document.activeElement?.textContent).toBe("Повернути");
    await user.keyboard("{Enter}");
    // Two toasts are stacked, the first is Барсик's. Its button is gone; focus goes to that card, never to the body.
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(document.activeElement?.getAttribute("data-saved-bookmark")).toBe(C);
  });

  it("a card stays on the page, inert, while it collapses, then leaves", async () => {
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Барсик/ });
    fireEvent.click(bookmarks()[0] as HTMLElement);
    const li = screen.getByRole("link", { name: /Барсик/, hidden: true }).closest("li");
    expect(li?.hasAttribute("inert")).toBe(true);
    await waitFor(() => expect(screen.queryByRole("link", { name: /Барсик/ })).toBeNull());
  });

  it("with prefers-reduced-motion nothing collapses: the card is gone in the same step", async () => {
    stubReducedMotion(true);
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Барсик/ });
    fireEvent.click(bookmarks()[0] as HTMLElement);
    expect(screen.queryByRole("link", { name: /Барсик/, hidden: true })).toBeNull();
    expect(order()).toEqual(["Рекс", "Мурчик"]);
  });

  it("shows the tooltip on hover and on keyboard focus", async () => {
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Барсик/ });
    const first = bookmarks()[0] as HTMLElement;
    fireEvent.pointerEnter(first, { pointerType: "mouse" });
    expect(screen.getByRole("tooltip").textContent).toBe(REMOVE);
    fireEvent.pointerLeave(first, { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    await userEvent.tab();
    let guard = 0;
    while (document.activeElement !== first && guard++ < 30) await userEvent.tab();
    expect(document.activeElement).toBe(first);
    expect(screen.getByRole("tooltip").textContent).toBe(REMOVE);
  });

  it("after the 6 seconds the undo is gone and the removal stands", async () => {
    render(<SavedPageScreen />);
    await screen.findByRole("link", { name: /Барсик/ });
    vi.useFakeTimers();
    fireEvent.click(bookmarks()[0] as HTMLElement);
    expect(screen.getByRole("button", { name: "Повернути" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5900);
    });
    expect(screen.getByRole("button", { name: "Повернути" })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByRole("button", { name: "Повернути" })).toBeNull();
    expect(order()).toEqual(["Рекс", "Мурчик"]);
    expect(storedIds()).toEqual([B, A]);
  });
});
