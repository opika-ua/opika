import { type AnimalListingState, DISCOVERABLE_LISTING_KINDS } from "@opika/domain";

/** Exactly the kinds `FeedCardView.listingKind` accepts, derived from the same
 * constant the contract's own enum and the SQL predicate are built from. */
type DiscoverableListingKind = (typeof DISCOVERABLE_LISTING_KINDS)[number];

const isDiscoverableKind = (kind: AnimalListingState["kind"]): kind is DiscoverableListingKind =>
  (DISCOVERABLE_LISTING_KINDS as readonly AnimalListingState["kind"][]).includes(kind);

/**
 * Narrows a listing's `kind` to what `FeedCardView.listingKind` accepts. Both
 * `feedList` and `galleryList` only ever reach this with an animal the query's
 * own predicate has already restricted to `DISCOVERABLE_LISTING_KINDS` — but
 * that's an invariant the predicate upholds, not something `Animal`'s own type
 * carries, so this makes the narrowing an explicit, loud failure if it's ever
 * wrong instead of a silent `as` cast papering over the gap between the two.
 *
 * Membership is tested against `DISCOVERABLE_LISTING_KINDS` rather than a
 * hand-written `!== "published" && !== "reserved"` pair, because a hand-written
 * one drifts in the direction that fails worst: widening the constant (a third
 * discoverable kind) widens the contract's enum and the SQL predicate
 * automatically, so rows of the new kind would start arriving here and this
 * function would throw on every one of them — a 500 on the whole feed page,
 * with nothing failing at compile time to warn anyone first. Deriving from the
 * constant means a widening needs no edit here at all, and the one place that
 * genuinely must decide something new about a third kind (`isReserved` in
 * `features/gallery/card-text.ts`, which has a `never` guard) still refuses to
 * compile until someone does.
 */
export function discoverableListingKind(listing: AnimalListingState): DiscoverableListingKind {
  if (!isDiscoverableKind(listing.kind)) {
    throw new Error(
      `A non-discoverable listing ("${listing.kind}") reached a handler that only expects ` +
        `${DISCOVERABLE_LISTING_KINDS.join("/")} — the query predicate that's supposed to ` +
        `prevent this has a gap.`,
    );
  }
  return listing.kind;
}
