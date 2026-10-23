import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAnimalSaved,
  MAX_LIKES,
  readLikesStore,
  subscribeToLikesChanges,
  toggleSavedAnimal,
} from "./likes-store";

const NOW = new Date("2026-10-23T12:00:00.000Z");

beforeEach(() => {
  window.localStorage.clear();
});

describe("toggleSavedAnimal", () => {
  it("saves an animal not yet saved", () => {
    const result = toggleSavedAnimal("a1", NOW);
    expect(result).toEqual({ kind: "saved" });
    expect(isAnimalSaved("a1")).toBe(true);
  });

  it("removes an animal already saved", () => {
    toggleSavedAnimal("a1", NOW);
    const result = toggleSavedAnimal("a1", NOW);
    expect(result).toEqual({ kind: "removed" });
    expect(isAnimalSaved("a1")).toBe(false);
  });

  it("puts a new save first (newest first, by likedAt)", () => {
    toggleSavedAnimal("a1", new Date("2026-10-20T00:00:00.000Z"));
    toggleSavedAnimal("a2", new Date("2026-10-21T00:00:00.000Z"));
    expect(readLikesStore().items.map((i) => i.animalId)).toEqual(["a2", "a1"]);
  });

  it("refuses a save past the cap, without dropping the oldest", () => {
    for (let i = 0; i < MAX_LIKES; i++) toggleSavedAnimal(`a${i}`, NOW);
    expect(readLikesStore().items).toHaveLength(MAX_LIKES);

    const result = toggleSavedAnimal("one-too-many", NOW);
    expect(result).toEqual({ kind: "cap_reached" });
    expect(readLikesStore().items).toHaveLength(MAX_LIKES);
    expect(isAnimalSaved("a0")).toBe(true);
  });

  it("removing at the cap frees one slot for a new save", () => {
    for (let i = 0; i < MAX_LIKES; i++) toggleSavedAnimal(`a${i}`, NOW);
    toggleSavedAnimal("a0", NOW); // remove
    const result = toggleSavedAnimal("new-animal", NOW);
    expect(result).toEqual({ kind: "saved" });
    expect(readLikesStore().items).toHaveLength(MAX_LIKES);
  });

  it("writes version 1 and an ISO likedAt", () => {
    toggleSavedAnimal("a1", NOW);
    const raw = window.localStorage.getItem("likes.v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(1);
    expect(parsed.items[0]).toEqual({ animalId: "a1", likedAt: "2026-10-23T12:00:00.000Z" });
  });
});

describe("reading a store that fails to parse", () => {
  it("treats garbage JSON as empty, not a crash", () => {
    window.localStorage.setItem("likes.v1", "{not json");
    expect(readLikesStore()).toEqual({ version: 1, items: [] });
  });

  it("treats a wrong shape as empty", () => {
    window.localStorage.setItem("likes.v1", JSON.stringify({ version: 1, items: "not an array" }));
    expect(readLikesStore()).toEqual({ version: 1, items: [] });
  });

  it("treats an unknown version as empty", () => {
    window.localStorage.setItem("likes.v1", JSON.stringify({ version: 2, items: [] }));
    expect(readLikesStore()).toEqual({ version: 1, items: [] });
  });

  it("the next write overwrites the unreadable value, not a partial merge", () => {
    window.localStorage.setItem("likes.v1", "{not json");
    toggleSavedAnimal("a1", NOW);
    expect(readLikesStore()).toEqual({
      version: 1,
      items: [{ animalId: "a1", likedAt: NOW.toISOString() }],
    });
  });
});

describe("when localStorage throws (private mode, blocked storage)", () => {
  // The module keeps its in-memory fallback at module scope once storage has thrown once
  // (deliberately: the page's lifetime, not re-checked on every call), so this test runs
  // against a freshly imported module instance rather than the one every other test in this
  // file shares — otherwise it would permanently switch every later test onto the fallback.
  it("still toggles, for the page's lifetime, and reports itself blocked", async () => {
    const getItemSpy = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    const setItemSpy = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });

    vi.resetModules();
    const fresh = await import("./likes-store");

    expect(fresh.isAnimalSaved("a1")).toBe(false);
    expect(fresh.likesStorageIsBlocked()).toBe(true);

    const result = fresh.toggleSavedAnimal("a1", NOW);
    expect(result).toEqual({ kind: "saved" });
    expect(fresh.isAnimalSaved("a1")).toBe(true);

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});

describe("subscribeToLikesChanges", () => {
  it("calls back on a storage event for this store's key", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToLikesChanges(onChange);
    window.dispatchEvent(new StorageEvent("storage", { key: "likes.v1" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("ignores a storage event for an unrelated key", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToLikesChanges(onChange);
    window.dispatchEvent(new StorageEvent("storage", { key: "some.other.key" }));
    expect(onChange).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("stops calling back after unsubscribe", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToLikesChanges(onChange);
    unsubscribe();
    window.dispatchEvent(new StorageEvent("storage", { key: "likes.v1" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
