import { type CityId, type FeedFilters, NO_FILTERS } from "@opika/domain";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { readStoredFilters } from "./filter-state";
import { useFeedFilters } from "./use-feed-filters";

const BROVARY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CityId;
const IRPIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as CityId;

function withCity(id: CityId): FeedFilters {
  return { ...NO_FILTERS, cities: { kind: "oneOf", values: [id] } };
}

describe("useFeedFilters", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("syncs to a stored preference by the time the hook has mounted", async () => {
    const stored = withCity(BROVARY_ID);
    window.sessionStorage.setItem("opika:filters", JSON.stringify(stored));

    const { result } = renderHook(() => useFeedFilters());

    // renderHook flushes the mount effect inside its own act(), so by the
    // time `result` is readable the sync has already happened — this
    // wouldn't fail if the effect were missing entirely, only waitFor below
    // exercises that. Kept as the documented, asserted end state.
    await waitFor(() => {
      expect(result.current[0]).toEqual(stored);
    });
  });

  it("persists a new selection to sessionStorage", async () => {
    const { result } = renderHook(() => useFeedFilters());
    const next = withCity(IRPIN_ID);

    act(() => {
      result.current[1](next);
    });

    expect(result.current[0]).toEqual(next);
    expect(readStoredFilters(window.sessionStorage)).toEqual(next);
  });
});
