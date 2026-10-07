import {
  type AnimalListingState,
  confirmationAnchorOf,
  DEFAULT_FRESHNESS_POLICY,
  type Freshness,
  freshnessOf,
} from "@opika/domain";

/**
 * How fresh a listing is, measured from when the shelter last confirmed the
 * animal is still looking (H2-3, decision #10 revised 2026-10-07) — never from
 * `Animal.lastUpdatedAt`, which is edit time: once shelters can edit, a typo
 * fix would otherwise make a four-month-old card read "оновлено сьогодні".
 *
 * Every caller (`feedList`, `galleryList`, `animalsById`) only reaches this
 * with a listing its own query or guard already restricted to the
 * discoverable kinds, and every discoverable listing carries a confirmation.
 * That is an invariant the queries uphold, not something `Animal`'s type
 * carries — so, as with `discoverableListingKind`, a gap fails loudly here
 * rather than rendering a card measured from some other date.
 */
export function listingFreshness(listing: AnimalListingState, now: Date): Freshness {
  const confirmedAt = confirmationAnchorOf(listing);
  // `== null`, not `=== null`: `rowToAnimal` does not Zod-parse the listing
  // JSONB, so a discoverable row missing its `confirmedAt` key arrives as
  // `undefined`, which must hit this named failure, not a bare TypeError below.
  if (confirmedAt == null) {
    throw new Error(
      `A "${listing.kind}" listing reached a freshness calculation; only listings an adopter ` +
        "can see carry a confirmation — the query predicate that's supposed to prevent this has a gap.",
    );
  }
  return freshnessOf(confirmedAt, now, DEFAULT_FRESHNESS_POLICY);
}
