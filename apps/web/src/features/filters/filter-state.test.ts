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
});
