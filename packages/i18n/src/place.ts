import { ukPublic as uk } from "./messages/uk-public";
import { fillTemplate } from "./template";

/**
 * What a surface needs to print a settlement. Structural on purpose (a `CityLabelView` fits): this
 * package knows the strings, not the contract.
 */
export type PlaceLabel = {
  readonly name: string;
  readonly kind: "special_status_city" | "city" | "selyshche" | "village";
  readonly nameScope:
    | "unique_in_ukraine"
    | "unique_in_region"
    | "unique_in_district"
    | "shared_in_district";
  readonly regionShort: string;
  readonly raion: string | null;
};

const PREFIX: Record<PlaceLabel["kind"], string> = {
  special_status_city: uk.place.prefixCity,
  city: uk.place.prefixCity,
  selyshche: uk.place.prefixSelyshche,
  village: uk.place.prefixVillage,
};

const WHITESPACE = /\s/u;

/** Case- and spacing-insensitive form of a name, split on whitespace (linear, no `\s+` regex). */
function squash(text: string): string {
  return text.toLowerCase().split(WHITESPACE).filter(Boolean).join(" ");
}

/**
 * True for a city that is its own region (Kyiv, Sevastopol): naming the region after it only says
 * the same word twice. The settlement kind is the data model's signal; the printed-name check also
 * catches a row whose kind was stored as a plain city.
 */
export function isOwnRegion(place: Pick<PlaceLabel, "kind" | "name" | "regionShort">): boolean {
  return (
    place.kind === "special_status_city" ||
    squash(`${PREFIX[place.kind]} ${place.name}`) === squash(place.regionShort)
  );
}

/** Whether naming the oblast after the place says anything: it must exist and not be the place itself. */
function hasRegionToAdd(place: PlaceLabel): boolean {
  return squash(place.regionShort) !== "" && !isOwnRegion(place);
}

/**
 * Removes the words of `tail` (each slot lists its alternatives) from the end of `text`, with at
 * least one whitespace character before each, and the whitespace before the first. Null when the
 * tail is absent. A backward scan, linear on any input (it replaces `\s+` regexes that CodeQL
 * flags as polynomial); `\s` is the same set as before, so U+00A0 and tabs still count.
 */
function stripTail(text: string, tail: readonly (readonly string[])[]): string | null {
  let end = text.length;
  for (let i = tail.length - 1; i >= 0; i--) {
    const head = text.slice(0, end);
    const word = tail[i]?.find((w) => head.endsWith(w));
    if (word === undefined) return null;
    end -= word.length;
    const wordStart = end;
    while (end > 0 && WHITESPACE.test(text.charAt(end - 1))) end--;
    if (end === wordStart) return null;
  }
  return text.slice(0, end);
}

/** «Броварський район» -> «Броварський р-н»; a raion that does not end in «район» is kept as is. */
function raionShort(raion: string): string {
  const name = stripTail(raion, [["район"]]) ?? raion;
  return name === raion ? raion : fillTemplate(uk.place.districtShort, { name });
}

/**
 * «Броварська міська територіальна громада» -> «Броварська громада». A name that does not carry
 * the «міська/селищна/сільська територіальна громада» tail is kept as is.
 */
export function hromadaShort(hromada: string): string {
  const name =
    stripTail(hromada, [["міська", "селищна", "сільська"], ["територіальна"], ["громада"]]) ??
    hromada;
  return name === hromada ? hromada : fillTemplate(uk.place.hromadaShort, { name });
}

/**
 * A settlement as a meta line prints it: the kind prefix and the name, then only as much of the
 * oblast and raion as the name needs to be unambiguous (`nameScope`, computed across the whole
 * settlement list at import). A card adds the oblast whenever the name is not unique in Ukraine;
 * a page that has room (`full`) adds the raion too when the name repeats inside its oblast. An
 * `address` line (the shelter's location) is `full` plus the oblast even for a unique name. A city
 * that is its own region (`isOwnRegion`) never gets the oblast added.
 */
export function placeText(
  place: PlaceLabel,
  context: "card" | "full" | "address" = "card",
): string {
  const base = `${PREFIX[place.kind]} ${place.name}`;
  return qualify(base, place, context);
}

/**
 * The bare name, for an option pill or a title: no kind prefix, but the same oblast suffix, so two
 * settlements called «Миколаївка» are told apart where they sit side by side.
 */
export function placeName(place: PlaceLabel): string {
  return qualify(place.name, place, "card");
}

/**
 * The second line of a list row, only for a name that is not unique in Ukraine: «Броварський р-н,
 * Київська обл.» (raion and oblast), or the oblast alone when the raion does not tell it apart.
 * `null` for a unique name, so a row never prints a hint that says nothing.
 */
export function placeHint(place: PlaceLabel): string | null {
  if (place.nameScope === "unique_in_ukraine" || !hasRegionToAdd(place)) return null;
  const needsRaion =
    place.raion !== null &&
    (place.nameScope === "unique_in_district" || place.nameScope === "shared_in_district");
  return needsRaion && place.raion !== null
    ? `${raionShort(place.raion)}, ${place.regionShort}`
    : place.regionShort;
}

function qualify(base: string, place: PlaceLabel, context: "card" | "full" | "address"): string {
  if (!hasRegionToAdd(place)) return base;
  if (place.nameScope === "unique_in_ukraine" && context !== "address") return base;
  const needsRaion =
    context !== "card" &&
    place.raion !== null &&
    (place.nameScope === "unique_in_district" || place.nameScope === "shared_in_district");
  if (needsRaion && place.raion !== null) {
    return fillTemplate(uk.place.withDistrictAndRegion, {
      place: base,
      district: raionShort(place.raion),
      region: place.regionShort,
    });
  }
  return fillTemplate(uk.place.withRegion, { place: base, region: place.regionShort });
}
