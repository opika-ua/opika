import { type FeedFilters, NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { listedInSheltersIndex, loadShelterPage, SHELTER_FILTERS_ABOVE } from "./shelter-page-load";
import {
  CITY_ID,
  makeCardView,
  makeFacetCounts,
  makeListOutput,
  makeShelterPageShelter,
  SHELTER_ID,
  stubShelterPageClient,
} from "./test-fixtures";

const cards = (n: number) => Array.from({ length: n }, (_, i) => makeCardView(i + 1));
const QUERY = { sort: "freshest", page: 1, filters: NO_FILTERS } as const;
const CATS: FeedFilters = { ...NO_FILTERS, species: { kind: "oneOf", values: ["cat"] } };

function listOf(total: number) {
  return { ...makeListOutput(cards(Math.min(total, 24))), totalMatching: total };
}

describe("the shelter page's filters (loader)", () => {
  it("offers none at 12 animals or fewer, and reads no counts for them", async () => {
    const { client, facetCounts } = stubShelterPageClient(
      { kind: "answer" },
      listOf(SHELTER_FILTERS_ABOVE),
    );
    const load = await loadShelterPage(SHELTER_ID, QUERY, client);
    expect(load.kind === "shelter" && load.view.filterUi).toBeNull();
    expect(facetCounts).not.toHaveBeenCalled();
  });

  it("offers them above 12, with counts scoped to this shelter", async () => {
    const { client, facetCounts } = stubShelterPageClient({ kind: "answer" }, listOf(13));
    const load = await loadShelterPage(SHELTER_ID, QUERY, client);
    expect(facetCounts).toHaveBeenCalledWith({
      filters: NO_FILTERS,
      sort: "freshest",
      scope: { kind: "shelter", shelterId: SHELTER_ID },
    });
    expect(facetCounts).toHaveBeenCalledTimes(1);
    if (load.kind !== "shelter") throw new Error("expected the shelter page");
    expect(load.view.listedTotal).toBe(13);
    expect(load.view.filterUi?.hasBothSpecies).toBe(true);
  });

  it("knows a shelter with one species only: no switch", async () => {
    const { client, facetCounts } = stubShelterPageClient({ kind: "answer" }, listOf(20));
    facetCounts.mockResolvedValue(makeFacetCounts({ species: { dog: 20, cat: 0 } }));
    const load = await loadShelterPage(SHELTER_ID, QUERY, client);
    expect(load.kind === "shelter" && load.view.filterUi?.hasBothSpecies).toBe(false);
  });

  it("keeps the controls when a filter is in the URL, even on a small shelter, and reads the whole count unfiltered", async () => {
    const { client, facetCounts } = stubShelterPageClient({ kind: "answer" }, listOf(2));
    await loadShelterPage(SHELTER_ID, { ...QUERY, filters: CATS }, client);
    expect(facetCounts).toHaveBeenCalledTimes(2);
    expect(facetCounts).toHaveBeenCalledWith(expect.objectContaining({ filters: NO_FILTERS }));
  });

  it("asks for relaxation suggestions, scoped, only when nothing matches", async () => {
    const empty = stubShelterPageClient({ kind: "answer" }, listOf(0));
    await loadShelterPage(SHELTER_ID, { ...QUERY, filters: CATS }, empty.client);
    expect(empty.relaxationCounts).toHaveBeenCalledWith({
      filters: CATS,
      sort: "freshest",
      scope: { kind: "shelter", shelterId: SHELTER_ID },
    });
    const some = stubShelterPageClient({ kind: "answer" }, listOf(5));
    await loadShelterPage(SHELTER_ID, { ...QUERY, filters: CATS }, some.client);
    expect(some.relaxationCounts).not.toHaveBeenCalled();
  });

  it("shows the filtered counts for the filters in force, and the unfiltered ones only for the total", async () => {
    const { client, facetCounts } = stubShelterPageClient({ kind: "answer" }, listOf(2));
    const filteredAnswer = makeFacetCounts({ species: { dog: 0, cat: 2 } });
    const unfilteredAnswer = makeFacetCounts({ species: { dog: 5, cat: 7 } });
    facetCounts.mockImplementation(async (input?: { filters: unknown }) =>
      input?.filters === NO_FILTERS ? unfilteredAnswer : filteredAnswer,
    );
    const load = await loadShelterPage(SHELTER_ID, { ...QUERY, filters: CATS }, client);
    if (load.kind !== "shelter") throw new Error("expected the shelter page");
    expect(facetCounts).toHaveBeenCalledWith({
      filters: CATS,
      sort: "freshest",
      scope: { kind: "shelter", shelterId: SHELTER_ID },
    });
    expect(load.view.filterUi?.counts).toBe(filteredAnswer);
    expect(load.view.listedTotal).toBe(12);
  });

  it("answers a legitimate 404 even when a read started beside the shelter fails", async () => {
    const { client, galleryList } = stubShelterPageClient({ kind: "refuse", code: "NOT_FOUND" });
    galleryList.mockRejectedValue(new Error("connection terminated"));
    expect(await loadShelterPage(SHELTER_ID, QUERY, client)).toEqual({ kind: "not_found" });
  });
});

describe("the shelter page under «Зачекались» (loader)", () => {
  const WAITING = { ...QUERY, sort: "longest_waiting" } as const;
  const scope = { kind: "shelter", shelterId: SHELTER_ID } as const;
  const wholeOf = (dog: number, cat: number) => makeFacetCounts({ species: { dog, cat } });

  it("reads the shelter's whole count under the freshest sort, so the heading is not the sort's", async () => {
    const { client, facetCounts } = stubShelterPageClient({ kind: "answer" }, listOf(0));
    facetCounts.mockResolvedValue(wholeOf(3, 2));
    const load = await loadShelterPage(SHELTER_ID, WAITING, client);
    expect(facetCounts).toHaveBeenCalledTimes(1);
    expect(facetCounts).toHaveBeenCalledWith({ filters: NO_FILTERS, sort: "freshest", scope });
    if (load.kind !== "shelter") throw new Error("expected the shelter page");
    expect(load.view.listedTotal).toBe(5);
    expect(load.view.filterUi).toBeNull();
    expect(load.view.listedSpecies).toEqual(["dog", "cat"]);
  });

  it("offers filters by the shelter's whole count, with counts and suggestions under the sort", async () => {
    const { client, facetCounts, relaxationCounts } = stubShelterPageClient(
      { kind: "answer" },
      listOf(0),
    );
    const sorted = wholeOf(0, 0);
    facetCounts.mockImplementation(async (input?: { filters: unknown; sort?: unknown }) =>
      input?.sort === "freshest" ? wholeOf(10, 10) : sorted,
    );
    const load = await loadShelterPage(SHELTER_ID, WAITING, client);
    expect(facetCounts).toHaveBeenCalledWith({
      filters: NO_FILTERS,
      sort: "longest_waiting",
      scope,
    });
    expect(relaxationCounts).toHaveBeenCalledWith({
      filters: NO_FILTERS,
      sort: "longest_waiting",
      scope,
    });
    if (load.kind !== "shelter") throw new Error("expected the shelter page");
    expect(load.view.listedTotal).toBe(20);
    expect(load.view.filterUi?.counts).toBe(sorted);
    expect(load.view.filterUi?.hasBothSpecies).toBe(true);
  });

  it("with a filter on: the filtered counts under the sort, the whole under the freshest sort", async () => {
    const { client, facetCounts } = stubShelterPageClient({ kind: "answer" }, listOf(1));
    await loadShelterPage(SHELTER_ID, { ...WAITING, filters: CATS }, client);
    expect(facetCounts).toHaveBeenCalledTimes(2);
    expect(facetCounts).toHaveBeenCalledWith({ filters: CATS, sort: "longest_waiting", scope });
    expect(facetCounts).toHaveBeenCalledWith({ filters: NO_FILTERS, sort: "freshest", scope });
  });
});

describe("the species a shelter lists (for its title and description)", () => {
  it("reads them off the cards when the shelter is small, with no extra query", async () => {
    const mixed = makeListOutput([
      makeCardView(1, { species: "cat" }),
      makeCardView(2, { species: "cat" }),
    ]);
    const { client, facetCounts } = stubShelterPageClient({ kind: "answer" }, mixed);
    const load = await loadShelterPage(SHELTER_ID, QUERY, client);
    expect(load.kind === "shelter" && load.view.listedSpecies).toEqual(["cat"]);
    expect(facetCounts).not.toHaveBeenCalled();
  });

  it("reads them off the unfiltered counts when there are any, whatever the filter", async () => {
    const { client, facetCounts } = stubShelterPageClient({ kind: "answer" }, listOf(2));
    facetCounts.mockImplementation(async (input?: { filters: unknown }) =>
      makeFacetCounts({
        species: input?.filters === NO_FILTERS ? { dog: 1, cat: 1 } : { dog: 0, cat: 1 },
      }),
    );
    const load = await loadShelterPage(SHELTER_ID, { ...QUERY, filters: CATS }, client);
    expect(load.kind === "shelter" && load.view.listedSpecies).toEqual(["dog", "cat"]);
  });

  it("is empty for a shelter with nothing listed", async () => {
    const { client } = stubShelterPageClient({ kind: "answer" }, listOf(0));
    const load = await loadShelterPage(SHELTER_ID, QUERY, client);
    expect(load.kind === "shelter" && load.view.listedSpecies).toEqual([]);
  });
});

describe("the shelter page's city page (loader)", () => {
  it("carries the city's slug when its page exists, asking about that one city only", async () => {
    const { client } = stubShelterPageClient({ kind: "answer" }, undefined, undefined, true);
    const load = await loadShelterPage(SHELTER_ID, QUERY, client);
    expect(load.kind === "shelter" && load.view.cityPageSlug).toBe("brovary");
    expect(client.cities.withPages).toHaveBeenCalledWith({ ids: [CITY_ID] });
  });

  it("carries none when the city has no page", async () => {
    const { client } = stubShelterPageClient({ kind: "answer" });
    const load = await loadShelterPage(SHELTER_ID, QUERY, client);
    expect(load.kind === "shelter" && load.view.cityPageSlug).toBeNull();
  });
});

describe("whether /prytulky lists the shelter (loader)", () => {
  const open = { kind: "open" } as const;
  const paused = { kind: "paused", reason: "other" } as const;

  it.each([
    {
      case: "verified, open, with animals",
      verification: "verified",
      availability: open,
      total: 3,
      listed: true,
    },
    {
      case: "verified, open, with none",
      verification: "verified",
      availability: open,
      total: 0,
      listed: false,
    },
    {
      case: "verified but paused",
      verification: "verified",
      availability: paused,
      total: 3,
      listed: false,
    },
    {
      case: "listed before verification",
      verification: "listed_before_verification",
      availability: open,
      total: 3,
      listed: false,
    },
  ] as const)("$case", ({ verification, availability, total, listed }) => {
    const shelter = makeShelterPageShelter({ verification, availability });
    expect(listedInSheltersIndex(shelter, total)).toBe(listed);
  });

  it("is on the view the page is given", async () => {
    const { client } = stubShelterPageClient({ kind: "answer" }, listOf(2));
    const load = await loadShelterPage(SHELTER_ID, QUERY, client);
    expect(load.kind === "shelter" && load.view.sheltersIndexListed).toBe(true);
  });
});
