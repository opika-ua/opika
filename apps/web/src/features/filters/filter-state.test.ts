import { type CityId, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { readStoredFilters, writeStoredFilters } from "./filter-state";

const BROVARY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CityId;

function withCity(id: CityId): FeedFilters {
  return { ...NO_FILTERS, cities: { kind: "oneOf", values: [id] } };
}

describe("filter state persistence", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("defaults to NO_FILTERS when nothing is stored", () => {
    expect(readStoredFilters(window.sessionStorage)).toEqual(NO_FILTERS);
  });

  it("round-trips a real selection", () => {
    const selected = withCity(BROVARY_ID);

    writeStoredFilters(window.sessionStorage, selected);

    expect(readStoredFilters(window.sessionStorage)).toEqual(selected);
  });

  it("falls back to NO_FILTERS rather than throwing on corrupted JSON", () => {
    window.sessionStorage.setItem("opika:filters", "{not valid json");

    expect(readStoredFilters(window.sessionStorage)).toEqual(NO_FILTERS);
  });

  it("falls back to NO_FILTERS rather than throwing on schema-invalid stored data", () => {
    window.sessionStorage.setItem("opika:filters", JSON.stringify({ cities: "not-a-selection" }));

    expect(readStoredFilters(window.sessionStorage)).toEqual(NO_FILTERS);
  });

  /**
   * A browser with site data blocked doesn't hand back an empty storage — it
   * throws on every operation. Losing a filter preference is acceptable;
   * taking the page down over one is not.
   */
  describe("when the browser refuses storage entirely", () => {
    const blocked: Storage = {
      get length(): number {
        throw new DOMException("blocked", "SecurityError");
      },
      clear() {
        throw new DOMException("blocked", "SecurityError");
      },
      getItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      key() {
        throw new DOMException("blocked", "SecurityError");
      },
      removeItem() {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem() {
        throw new DOMException("blocked", "SecurityError");
      },
    };

    it("reads as NO_FILTERS instead of throwing", () => {
      expect(readStoredFilters(blocked)).toEqual(NO_FILTERS);
    });

    it("writes silently instead of throwing", () => {
      expect(() => writeStoredFilters(blocked, withCity(BROVARY_ID))).not.toThrow();
    });
  });
});
