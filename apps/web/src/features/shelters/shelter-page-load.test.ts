import { type FeedFilters, NO_FILTERS } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { loadShelterPage, SHELTER_FILTERS_ABOVE } from "./shelter-page-load";
import {
  makeCardView,
  makeFacetCounts,
  makeListOutput,
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
      scope: { kind: "shelter", shelterId: SHELTER_ID },
    });
    if (load.kind !== "shelter") throw new Error("expected the shelter page");
    expect(load.view.filterUi?.total).toBe(13);
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
      scope: { kind: "shelter", shelterId: SHELTER_ID },
    });
    const some = stubShelterPageClient({ kind: "answer" }, listOf(5));
    await loadShelterPage(SHELTER_ID, { ...QUERY, filters: CATS }, some.client);
    expect(some.relaxationCounts).not.toHaveBeenCalled();
  });
});
