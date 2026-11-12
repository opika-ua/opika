import type { FeedCardView } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import { animalFactsParts, fillTemplate, ukPublic as uk } from "@opika/i18n/public";

/**
 * A `switch`, not `card.listingKind === "reserved"`. The ternary would treat
 * a third discoverable kind as "not reserved" silently; this fails to
 * compile instead, the same guarantee `waitAnchorOf`
 * (`packages/domain/src/animals/listing.ts`) already gives the persistence
 * side of this same enum.
 */
export function isReserved(kind: FeedCardView["listingKind"]): boolean {
  switch (kind) {
    case "published":
      return false;
    case "reserved":
      return true;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled variant; unreachable at runtime */
    default: {
      const unreachable: never = kind;
      return unreachable;
    }
  }
}

/**
 * Which city to show and whether the animal lives away from its shelter -
 * the fact the meta line's "housing + city" fragment and the accessible name
 * both need. `FeedCardView.publicLocation` null means "at the shelter,"
 * per `CLAUDE.md`'s decision 17: the animal inherits the shelter's own
 * public location rather than carrying a redundant copy of it.
 */
export function cardCityId(card: FeedCardView): CityId {
  return card.publicLocation?.cityId ?? card.shelter.publicLocation.cityId;
}

/** Exported for `AnimalCard`'s `hideCityInMeta`, which only suppresses a bare place - a fostered card's "на перетримці, м. Бровари" says more than the city alone, so it stays. */
export function isFostered(card: FeedCardView): boolean {
  return card.publicLocation !== null;
}

/**
 * "на перетримці, м. Бровари" or "м. Бровари" - the meta line's terse
 * housing+city fragment. `null` when the city name hasn't resolved (the
 * caller's place lookup missed), so the meta line degrades to
 * "молодий · мала" rather than showing a broken template.
 */
export function housingCityLabel(card: FeedCardView, cityName: string | null): string | null {
  if (!cityName) return null;
  const template = isFostered(card) ? uk.cardMeta.fosteredHousing : uk.cardMeta.atShelter;
  return fillTemplate(template, { place: cityName });
}

/** The card's visible facts line, as parts: the shared formatter, no species and no city (the city is in the accessible name only). */
export function cardFactsParts(card: FeedCardView): readonly string[] {
  return animalFactsParts({
    sex: card.sex,
    ageBucket: card.ageBucket,
    ageSpan: card.ageSpan,
    size: card.size,
  });
}
