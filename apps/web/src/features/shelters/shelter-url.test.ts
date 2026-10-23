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
    });
  });

  it("degrades a stale or hand-edited query to the default sort and page 1", () => {
    expect(parseShelterPageQuery({ sort: "random", stor: "-4" })).toEqual({
      sort: "freshest",
      page: 1,
    });
  });

  it("ignores the gallery's filter params: the shelter page has none (DR1-D3)", () => {
    expect(parseShelterPageQuery({ vyd: "cat", misto: "brovary" })).toEqual({
      sort: "freshest",
      page: 1,
    });
  });
});
