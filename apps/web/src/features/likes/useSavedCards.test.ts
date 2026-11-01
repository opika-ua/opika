import type { AnimalId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import type { SavedCardResult } from "./useSavedCards";
import { savedCardsLoadStateOf } from "./useSavedCards";

const item = (animalId: string) => ({ kind: "available", animalId }) as unknown as SavedCardResult;
const none = new Map<string, SavedCardResult | null>();

describe("savedCardsLoadStateOf", () => {
  it("is unknown before ids have been read from storage at all", () => {
    expect(savedCardsLoadStateOf(null, none)).toEqual({ kind: "unknown" });
  });

  it("3 stored ids with nothing fetched yet is loading with count 3 - the skeleton count", () => {
    const ids = ["a", "b", "c"] as AnimalId[];
    expect(savedCardsLoadStateOf(ids, none)).toEqual({ kind: "loading", count: 3 });
  });

  it("0 stored ids is the empty state, never loading", () => {
    expect(savedCardsLoadStateOf([], none)).toEqual({ kind: "empty" });
  });

  it("is ready once every id has an answer, in the order of the ids, not of the answers", () => {
    const resolved = new Map([
      ["a", item("a")],
      ["b", item("b")],
    ]);
    expect(savedCardsLoadStateOf(["b", "a"], resolved)).toEqual({
      kind: "ready",
      items: [item("b"), item("a")],
    });
  });

  it("an id the server had no answer for is dropped, not left loading", () => {
    const resolved = new Map<string, SavedCardResult | null>([
      ["a", item("a")],
      ["b", null],
    ]);
    expect(savedCardsLoadStateOf(["a", "b"], resolved)).toEqual({
      kind: "ready",
      items: [item("a")],
    });
  });

  it("an id fetched earlier and removed does not count against the rest", () => {
    const resolved = new Map([
      ["a", item("a")],
      ["b", item("b")],
    ]);
    expect(savedCardsLoadStateOf(["b"], resolved)).toEqual({ kind: "ready", items: [item("b")] });
  });
});
