import type { FeedCardView } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import { ageBucketLabel, sizeLabel, uk } from "@opika/i18n";
import { freshnessLabel } from "@opika/ui";

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
 * Which city to show and whether the animal lives away from its shelter —
 * the fact the meta line's "housing + city" fragment and the accessible name
 * both need. `FeedCardView.publicLocation` null means "at the shelter,"
 * per `CLAUDE.md`'s decision 17: the animal inherits the shelter's own
 * public location rather than carrying a redundant copy of it.
 */
export function cardCityId(card: FeedCardView): CityId {
  return card.publicLocation?.cityId ?? card.shelter.publicLocation.cityId;
}

function isFostered(card: FeedCardView): boolean {
  return card.publicLocation !== null;
}

/**
 * "живе у волонтерки, м. Бровари" or "м. Бровари" — the meta line's terse
 * housing+city fragment. `null` when the city name hasn't resolved (the
 * caller's `cities.list` lookup missed), so the meta line degrades to
 * "молодий · мала" rather than showing a broken template.
 */
export function housingCityLabel(card: FeedCardView, cityName: string | null): string | null {
  if (!cityName) return null;
  const template = isFostered(card) ? uk.cardMeta.fosteredHousing : uk.cardMeta.atShelter;
  return template.replace("{city}", cityName);
}

/** "молодий · мала · живе у волонтерки, м. Бровари" — the card's full meta line. */
export function cardMetaLine(card: FeedCardView, cityName: string | null): string {
  return [ageBucketLabel(card.ageBucket), sizeLabel(card.size), housingCityLabel(card, cityName)]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * "Мурчик, Уже домовляються, молодий, Бровари, Оновлено 3 дні тому" — the
 * card link's accessible name.
 *
 * docs/design/README.md, "The Gallery" > "Keyboard": "Screen readers get
 * name, age, city, then the sentence 'оновлено 41 день тому' via
 * `aria-label`; the pips are `aria-hidden`." Reserved status is inserted
 * right after the name, ahead of what the design lists — safety-critical
 * context (a blind adopter must not contact a shelter about an animal
 * already spoken for without knowing that going in) a sighted user already
 * has from the badge before reaching the meta line at all.
 */
export function cardAccessibleName(card: FeedCardView, cityName: string | null): string {
  return [
    card.name,
    isReserved(card.listingKind) ? uk.reserved.badge : null,
    ageBucketLabel(card.ageBucket),
    cityName,
    freshnessLabel(card.freshness),
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}
