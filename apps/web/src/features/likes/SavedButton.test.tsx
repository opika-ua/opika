import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLikesStore, resetLikesStoreMemoryForTests, toggleSavedAnimal } from "./likes-store";
import { SavedButton } from "./SavedButton";
import { resetSavedAvailabilityForTests } from "./saved-availability";

const cardsByIds = vi.fn();
vi.mock("../../api/browser-client", () => ({
  savedBrowserClient: { animals: { cardsByIds: (...args: unknown[]) => cardsByIds(...args) } },
}));

beforeEach(() => {
  resetLikesStoreMemoryForTests();
  resetSavedAvailabilityForTests();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-has-saved");
  cardsByIds.mockReset();
});

describe("the header's saved count", () => {
  it("drops ids that no longer resolve to a servable animal, and the entry hides at zero", async () => {
    for (const id of ["gone-1", "gone-2"]) toggleSavedAnimal(id, new Date());
    cardsByIds.mockResolvedValue({
      items: [
        { kind: "unavailable", animalId: "gone-1", name: null },
        { kind: "unavailable", animalId: "gone-2", name: null },
      ],
    });
    render(<SavedButton layout="button" testId="saved" />);
    await waitFor(() =>
      expect(document.documentElement.hasAttribute("data-has-saved")).toBe(false),
    );
    expect(readLikesStore().items).toEqual([]);
  });

  it("counts an available animal and not an adopted one, keeping the adopted id stored", async () => {
    for (const id of ["live", "adopted"]) toggleSavedAnimal(id, new Date());
    cardsByIds.mockResolvedValue({
      items: [
        { kind: "available", animalId: "live" },
        { kind: "unavailable", animalId: "adopted", name: "Мурчик" },
      ],
    });
    render(<SavedButton layout="button" testId="saved" />);
    expect(await screen.findByRole("link", { name: /Збережені.*1/ })).toBeTruthy();
    expect(readLikesStore().items).toHaveLength(2);
  });

  it("falls back to the stored count when the request fails", async () => {
    for (const id of ["a", "b"]) toggleSavedAnimal(id, new Date());
    cardsByIds.mockRejectedValue(new Error("offline"));
    render(<SavedButton layout="button" testId="saved" />);
    expect(await screen.findByRole("link", { name: /Збережені.*2/ })).toBeTruthy();
  });
});
