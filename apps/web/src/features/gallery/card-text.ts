import type { FeedCardView } from "@opika/contracts";
import type { AnimalSpecies, CityId } from "@opika/domain";
import { ageBucketLabel, ageWordFor, sexWordFor, sizeLabel, uk } from "@opika/i18n";
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

/** Exported for `AnimalCard`'s `hideCityInMeta`, which only suppresses a bare "м. {city}" — a fostered card's "на перетримці, м. {city}" says more than city alone, so it stays. */
export function isFostered(card: FeedCardView): boolean {
  return card.publicLocation !== null;
}

/**
 * "на перетримці, м. Бровари" or "м. Бровари" — the meta line's terse
 * housing+city fragment. `null` when the city name hasn't resolved (the
 * caller's `cities.list` lookup missed), so the meta line degrades to
 * "молодий · мала" rather than showing a broken template.
 */
export function housingCityLabel(card: FeedCardView, cityName: string | null): string | null {
  if (!cityName) return null;
  const template = isFostered(card) ? uk.cardMeta.fosteredHousing : uk.cardMeta.atShelter;
  return template.replace("{city}", () => cityName);
}

/** "молодий · мала · на перетримці, м. Бровари" — the card's full meta line. */
export function cardMetaLine(card: FeedCardView, cityName: string | null): string {
  return [
    ageWordFor(card.ageBucket, card.sex),
    sizeLabel(card.size),
    housingCityLabel(card, cityName),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

/**
 * ["Хлопчик", "молодий", "мала"] — the gallery-v3 card's meta line (Figma
 * `58:1617`), as separate parts rather than one joined string: the design
 * renders a decorative bar between each part (`GalleryCard.tsx`'s own
 * `META_SEPARATOR`), not a "·" character, so the caller needs the parts to
 * interleave them with real DOM separators. Sex is named as its own word
 * rather than folded into the age word's grammatical gender, and city is
 * never included (the design keeps city in the accessible name only,
 * `cardAccessibleName`, never visible on the card itself — a new function
 * rather than editing `cardMetaLine` above, which the old `AnimalCard`
 * shared with the shelter and saved pages still uses unchanged). Age uses
 * `ageBucketLabel` (the bare, gender-neutral word), not `ageWordFor`,
 * because the sex word now carries that information on its own. An
 * `"unknown"` sex drops the segment rather than guessing.
 */
export function cardFactsParts(card: FeedCardView): readonly string[] {
  return [sexWordFor(card.sex), ageBucketLabel(card.ageBucket), sizeLabel(card.size)].filter(
    (part): part is string => Boolean(part),
  );
}

const SPECIES_BADGE_TONE: Record<AnimalSpecies, "bg-brand-dog" | "bg-brand-accent"> = {
  dog: "bg-brand-dog",
  cat: "bg-brand-accent",
};

/**
 * The gallery-v3 freshness badge's fill, by species (owner decision,
 * 2026-10-25 — inferred from the Figma frame: every dog card is purple,
 * every cat card orange). A `Record` over the domain's own closed species
 * union, not a ternary — CLAUDE.md decision #8 keeps `species` closed at
 * `dog | cat`, and a third literal added there becomes a compile error
 * here rather than a silently uncoloured badge.
 */
export function cardSpeciesBadgeTone(species: AnimalSpecies): "bg-brand-dog" | "bg-brand-accent" {
  return SPECIES_BADGE_TONE[species];
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
    ageWordFor(card.ageBucket, card.sex),
    cityName,
    freshnessLabel(card.freshness),
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
}
