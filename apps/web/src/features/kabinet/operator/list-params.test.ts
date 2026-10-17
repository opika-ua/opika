import { describe, expect, it } from "vitest";
import { listFiltersOf, listHrefOf } from "./list-params";

/** RU-T4: S1's search and status filter live in the URL. */
describe("listFiltersOf", () => {
  it("reads the search and the status", () => {
    expect(listFiltersOf({ poshuk: "  Лапа ", status: "pending" })).toEqual({
      search: "Лапа",
      status: "pending",
    });
  });

  it("treats blank and unknown values as no filter, never as an error", () => {
    expect(listFiltersOf({})).toEqual({ search: null, status: null });
    expect(listFiltersOf({ poshuk: "   ", status: "approved" })).toEqual({
      search: null,
      status: null,
    });
  });

  it("reads a repeated parameter as its first value", () => {
    expect(listFiltersOf({ poshuk: ["Лапа", "Хвіст"], status: ["verified", "pending"] })).toEqual({
      search: "Лапа",
      status: "verified",
    });
  });

  it("cuts a search to the contract's 200 characters, so the procedure never refuses it", () => {
    expect(listFiltersOf({ poshuk: "я".repeat(250) }).search).toHaveLength(200);
  });
});

describe("listHrefOf", () => {
  it("carries only the filters that are set, and round-trips through listFiltersOf", () => {
    expect(listHrefOf({ search: null, status: null })).toBe("/kabinet/prytulky");
    expect(listHrefOf({ search: null, status: "suspended" })).toBe(
      "/kabinet/prytulky?status=suspended",
    );
    const href = listHrefOf({ search: "Лапа & Ко", status: "pending" });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(listFiltersOf(params)).toEqual({ search: "Лапа & Ко", status: "pending" });
  });
});
