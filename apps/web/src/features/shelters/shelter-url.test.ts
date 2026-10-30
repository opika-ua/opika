import { type FeedFilters, NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { parseShelterPageQuery, shelterPageHref } from "./shelter-url";

const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd" as never;

describe("the shelter page's own URL", () => {
  it("is the bare path in the default sort on page 1", () => {
    expect(shelterPageHref(ID, "freshest", 1)).toBe(`/prytulky/${ID}`);
  });

  it("carries the gallery's own sort and page params, and stays on this shelter's page", () => {
    expect(shelterPageHref(ID, "longest_waiting", 1)).toBe(`/prytulky/${ID}?sort=longest_waiting`);
    expect(shelterPageHref(ID, "freshest", 3)).toBe(`/prytulky/${ID}?stor=3`);
    expect(shelterPageHref(ID, "longest_waiting", 2)).toBe(
      `/prytulky/${ID}?sort=longest_waiting&stor=2`,
    );
  });

  it("reads back what it writes", () => {
    expect(parseShelterPageQuery({ sort: "longest_waiting", stor: "2" })).toEqual({
      sort: "longest_waiting",
      page: 2,
      filters: NO_FILTERS,
    });
  });

  it("degrades a stale or hand-edited query to the default sort and page 1", () => {
    expect(parseShelterPageQuery({ sort: "random", stor: "-4" })).toEqual({
      sort: "freshest",
      page: 1,
      filters: NO_FILTERS,
    });
  });

  it("reads the gallery's filter params, with the same keys, and drops oblast and city", () => {
    const query = parseShelterPageQuery({
      vyd: "cat",
      rozmir: "small",
      obl: "kyivska",
      misto: "brovary",
    });
    expect(query.filters.species).toEqual({ kind: "oneOf", values: ["cat"] });
    expect(query.filters.regions).toEqual({ kind: "any" });
    expect(query.filters.cities).toEqual({ kind: "any" });
  });

  it("writes filters back on the shelter's own path, and the bare path when there are none", () => {
    const filters: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } };
    expect(shelterPageHref(ID, "freshest", 1, filters)).toBe(`/prytulky/${ID}?vyd=cat`);
    expect(shelterPageHref(ID, "freshest", 2, filters)).toBe(`/prytulky/${ID}?vyd=cat&stor=2`);
    expect(shelterPageHref(ID, "freshest", 1, NO_FILTERS)).toBe(`/prytulky/${ID}`);
  });
});
