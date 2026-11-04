import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIKES_STORAGE_KEY,
  pruneSavedAnimals,
  readLikesStore,
  resetLikesStoreMemoryForTests,
  toggleSavedAnimal,
} from "./likes-store";
import {
  classifySavedItems,
  refreshSavedAvailability,
  resetSavedAvailabilityForTests,
  servableCount,
} from "./saved-availability";

const save = (...ids: string[]) => {
  for (const id of ids) toggleSavedAnimal(id, new Date());
};
const stored = () => readLikesStore().items.map((item) => item.animalId);

beforeEach(() => {
  resetLikesStoreMemoryForTests();
  resetSavedAvailabilityForTests();
  window.localStorage.removeItem(LIKES_STORAGE_KEY);
});

describe("classifySavedItems / servableCount", () => {
  it("counts only what the server serves; ids not asked about yet still count", () => {
    const known = classifySavedItems(
      ["live", "adopted", "reset"],
      [
        { kind: "available", animalId: "live" },
        { kind: "unavailable", animalId: "adopted", name: "Мурчик" },
        { kind: "unavailable", animalId: "reset", name: null },
      ],
    );
    expect(known.get("adopted")).toBe("unavailable");
    expect(known.get("reset")).toBe("gone");
    expect(servableCount(["live", "adopted", "reset", "fresh-save"], known)).toBe(2);
  });

  it("treats an id missing from the answer as gone", () => {
    expect(classifySavedItems(["x"], []).get("x")).toBe("gone");
  });
});

describe("refreshSavedAvailability", () => {
  it("prunes ids that no longer exist but keeps a paused or adopted animal's id", async () => {
    save("live", "paused", "reset");
    const prune = vi.fn(pruneSavedAnimals);
    await refreshSavedAvailability(
      async () => ({
        items: [
          { kind: "available", animalId: "live" },
          { kind: "unavailable", animalId: "paused", name: "Рижик" },
          { kind: "unavailable", animalId: "reset", name: null },
        ],
      }),
      Date.now(),
      prune,
    );
    expect(prune).toHaveBeenCalledWith(["reset"]);
    expect(stored().sort()).toEqual(["live", "paused"]);
  });

  it("changes nothing when the request fails", async () => {
    save("a", "b");
    await refreshSavedAvailability(
      async () => {
        throw new Error("offline");
      },
      Date.now(),
      pruneSavedAnimals,
    );
    expect(stored().sort()).toEqual(["a", "b"]);
  });

  it("does not ask again within the cache window, and asks only for new ids", async () => {
    save("a");
    const ask = vi.fn(async ({ animalIds }: { animalIds: string[] }) => ({
      items: animalIds.map((animalId) => ({ kind: "available" as const, animalId })),
    }));
    const now = Date.now();
    await refreshSavedAvailability(ask, now, pruneSavedAnimals);
    await refreshSavedAvailability(ask, now + 1000, pruneSavedAnimals);
    expect(ask).toHaveBeenCalledTimes(1);
    save("b");
    await refreshSavedAvailability(ask, now + 2000, pruneSavedAnimals);
    expect(ask).toHaveBeenLastCalledWith({ animalIds: ["b"] });
  });
});
