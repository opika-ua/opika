import type { PlaceOptionView, PlaceSearchResult } from "@opika/contracts";
import type { CityId, RegionId } from "@opika/domain";
import { fillTemplate, isOwnRegion, placeLabel, uk } from "@opika/i18n";
import { useCallback, useMemo } from "react";
import type { ComboboxOption, ComboboxResult } from "../../../ui/Combobox";

/**
 * The settlement picker's search and messages, shared by the operator's S2/S4 forms and the
 * shelter's «Де зараз тварина» (owner, 2026-11-18), so both print a place the same way.
 */

/** A settlement as the picker prints it: the kind's prefix and name, then what tells namesakes apart. */
export function placeOptionOf(place: PlaceOptionView): ComboboxOption<CityId> {
  // Kyiv and Sevastopol are their own region: the label already says it.
  const region = isOwnRegion({
    kind: place.kind,
    name: place.name,
    regionShort: place.region.ukShort,
  })
    ? null
    : place.region.ukShort;
  const detail = [place.district, place.hromada, region]
    .filter((part): part is string => part !== null)
    .join(" · ");
  return {
    value: place.id,
    label: placeLabel(place.kind, place.name),
    ...(detail === "" ? {} : { detail }),
  };
}

/** `registry.cities.search` or `shelter.cities.search`: one input, one answer, one search. */
type CitySearch = {
  search: (
    input: { query: string; regionBias: RegionId | null },
    options: { signal: AbortSignal },
  ) => Promise<PlaceSearchResult>;
};

/** The city picker's search and messages; the server stays the authority on which id exists. */
export function useCityPicker(cities: CitySearch) {
  const picker = uk.kabinet.cityPicker;
  const messages = useMemo(
    () => ({
      placeholder: picker.placeholder,
      tooShort: picker.tooShort,
      loading: picker.loading,
      empty: picker.empty,
      error: picker.error,
      retry: picker.retry,
      found: (count: number) => fillTemplate(picker.found, { count: String(count) }),
      clear: picker.clear,
      close: picker.close,
    }),
    [picker],
  );
  const search = useCallback(
    async (query: string, signal: AbortSignal): Promise<ComboboxResult<CityId>> => {
      const answer = await cities.search({ query, regionBias: null }, { signal });
      return answer.kind === "too_short"
        ? { kind: "too_short" }
        : { kind: "options", options: answer.places.map(placeOptionOf) };
    },
    [cities],
  );
  return { messages, search };
}
