import type { Database } from "@opika/db";
import { cityRepo, citySearchRepo } from "@opika/db/repos";
import { type CityId, placeQueryOf } from "@opika/domain";
import { isOwnRegion, placeLabel } from "@opika/i18n";
import type { CitySearchAnswer, RegistrationCity } from "./form-state";

type PlaceMatch = Awaited<ReturnType<ReturnType<typeof citySearchRepo>["search"]>>[number];

/** A settlement as the picker prints it: the kind's prefix and name, then what tells namesakes apart. */
function optionOf(place: PlaceMatch) {
  const region = isOwnRegion({
    kind: place.kind,
    name: place.nameUk,
    regionShort: place.regionUkShort,
  })
    ? null
    : place.regionUkShort;
  const hromada = place.nameScope === "shared_in_district" ? place.hromadaNameUk : null;
  const detail = [place.districtNameUk, hromada, region]
    .filter((part): part is string => part !== null && part !== "")
    .join(" · ");
  return {
    value: place.id,
    label: placeLabel(place.kind, place.nameUk),
    ...(detail === "" ? {} : { detail }),
  };
}

/** The form's settlement search: the operator's search (`registry.cities.search`), for anyone. */
export async function searchRegistrationCitiesIn(
  db: Database,
  query: string,
): Promise<CitySearchAnswer> {
  const parsed = placeQueryOf(query);
  if (parsed.kind === "too_short") return { kind: "too_short" };
  const rows = await citySearchRepo(db).search(parsed, { regionBias: null });
  return { kind: "options", options: rows.map(optionOf) };
}

/**
 * The city a submit names: by id from the picker, or, without JS, by its exact name when exactly
 * one current settlement (or exactly one city among namesakes) has it. Anything else is no city.
 */
export async function resolveRegistrationCity(
  db: Database,
  by: { kind: "id"; id: string } | { kind: "name"; name: string },
): Promise<RegistrationCity | null> {
  if (by.kind === "id") {
    const city = await cityRepo(db).findCurrentById(by.id as CityId);
    return city === null ? null : { id: city.id, label: placeLabel(city.kind, city.name.uk) };
  }
  const parsed = placeQueryOf(by.name);
  if (parsed.kind === "too_short") return null;
  const wanted = by.name.trim().toLocaleLowerCase("uk");
  const exact = (await citySearchRepo(db).search(parsed, { regionBias: null })).filter(
    (place) => place.nameUk.toLocaleLowerCase("uk") === wanted,
  );
  const cities = exact.filter(
    (place) => place.kind === "city" || place.kind === "special_status_city",
  );
  const pick = exact.length === 1 ? exact[0] : cities.length === 1 ? cities[0] : undefined;
  return pick === undefined ? null : { id: pick.id, label: placeLabel(pick.kind, pick.nameUk) };
}
