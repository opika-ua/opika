import type { AnimalId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import type { SavedCardResult } from "./useSavedCards";
import { savedCardsLoadStateOf } from "./useSavedCards";

const ITEM = { kind: "available" } as unknown as SavedCardResult;

describe("savedCardsLoadStateOf", () => {
  it("is unknown before ids have been read from storage at all", () => {
    expect(savedCardsLoadStateOf(null, null)).toEqual({ kind: "unknown" });
  });

  it("3 stored ids with items still fetching is loading with count 3 - the skeleton count", () => {
    const ids = ["a", "b", "c"] as AnimalId[];
    expect(savedCardsLoadStateOf(ids, null)).toEqual({ kind: "loading", count: 3 });
  });

  it("0 stored ids is the empty state, never loading", () => {
    expect(savedCardsLoadStateOf([], null)).toEqual({ kind: "empty" });
  });

  it("once items resolve, the state is ready even if ids was empty - the caller, not this function, decides what an empty `items` means", () => {
    expect(savedCardsLoadStateOf([], [])).toEqual({ kind: "ready", items: [] });
  });

  it("is ready once items resolve, regardless of the ids count", () => {
    const ids = ["a"] as AnimalId[];
    expect(savedCardsLoadStateOf(ids, [ITEM])).toEqual({ kind: "ready", items: [ITEM] });
  });
});
