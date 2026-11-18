import type { AnimalLocation, CityId } from "@opika/domain";
import type { ComboboxOption } from "../../../ui/Combobox";

/**
 * «Де зараз тварина» (§12.2, P0-5) as the form holds it: in the shelter's city, or in a city of its
 * own picked with the settlement combobox (null until one is picked). Pure, so the rule is tested
 * without a DOM.
 */
export type LocationValue =
  | { kind: "shelter_city" }
  | { kind: "own_city"; city: ComboboxOption<CityId> | null };

/** The stored location as the form starts; an own city needs its label, read with the page. */
export function locationValueOf(
  stored: AnimalLocation,
  ownCity: ComboboxOption<CityId> | null,
): LocationValue {
  return stored.kind === "shelter_city"
    ? { kind: "shelter_city" }
    : { kind: "own_city", city: ownCity ?? { value: stored.cityId, label: "" } };
}

/** What a save sends: the new location, or null when nothing changed or no city is picked yet. */
export function locationPatchOf(
  stored: AnimalLocation,
  value: LocationValue,
): AnimalLocation | null {
  if (value.kind === "shelter_city") return stored.kind === "shelter_city" ? null : value;
  if (value.city === null) return null;
  if (stored.kind === "own_city" && stored.cityId === value.city.value) return null;
  return { kind: "own_city", cityId: value.city.value };
}

/** «В іншому місті» with no city picked can't be saved: the picker says so (`cityPicker.mustPick`). */
export const locationNeedsCity = (value: LocationValue): boolean =>
  value.kind === "own_city" && value.city === null;
