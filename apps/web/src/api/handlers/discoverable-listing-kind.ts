import type { AnimalListingState } from "@opika/domain";

/**
 * Narrows a listing's `kind` to the two `FeedCardView.listingKind` actually
 * accepts. Both `feedList` and `galleryList` only ever reach this with an
 * animal the query's own predicate has already restricted to
 * `DISCOVERABLE_LISTING_KINDS` — but that's an invariant the predicate
 * upholds, not something `Animal`'s own type carries, so this makes the
 * narrowing an explicit, loud failure if it's ever wrong instead of a
 * silent `as` cast papering over the gap between the two.
 */
export function discoverableListingKind(listing: AnimalListingState): "published" | "reserved" {
  if (listing.kind !== "published" && listing.kind !== "reserved") {
    throw new Error(
      `A non-discoverable listing ("${listing.kind}") reached a handler that only expects ` +
        `published/reserved — the query predicate that's supposed to prevent this has a gap.`,
    );
  }
  return listing.kind;
}
