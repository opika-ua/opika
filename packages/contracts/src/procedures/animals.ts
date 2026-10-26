import {
  AnimalIdSchema,
  DEFAULT_GALLERY_SORT,
  EVERYONE_SCOPE,
  FeedFiltersSchema,
  GalleryScopeSchema,
  GallerySortSchema,
} from "@opika/domain";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { apiErrors } from "../errors";
import { AnimalDetailViewSchema, FeedCardViewSchema } from "../views/animal";
import { ContactRevealViewSchema } from "../views/reveal";

export const AnimalsByIdInputSchema = z.object({
  animalId: AnimalIdSchema,
});

export const animalsByIdContract = oc
  .input(AnimalsByIdInputSchema)
  .output(AnimalDetailViewSchema)
  .errors({
    NOT_FOUND: apiErrors.NOT_FOUND,
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });

/**
 * DR1-Q2 (S8, the saved page): the number of ids a saved list could ever
 * hold (`MAX_LIKES` in `apps/web/src/features/likes/likes-store.ts`) - the
 * same figure, kept as its own named constant here since a client-side
 * storage cap and a server-side input limit are two different concerns
 * that happen to agree, not one value shared across a package boundary.
 */
export const MAX_SAVED_CARDS_PER_REQUEST = 200;

export const AnimalsCardsByIdsInputSchema = z.object({
  animalIds: z.array(AnimalIdSchema).max(MAX_SAVED_CARDS_PER_REQUEST),
});

/**
 * One entry per requested id, in the order asked - never a shorter array for
 * an id that no longer resolves, so the caller can zip the response back
 * against its own list without a lookup.
 *
 * `unavailable` carries no *reason* (adopted, withdrawn, a shelter paused or
 * no longer verified are all the same answer, "not shown any more") - but it
 * does carry the animal's name, when the row *was ever public*, because the
 * required copy names it ("«{name}» більше не показується на сайті"). This is
 * not the same leak commitment 2 protects: that rule is about a *shelter*
 * probing whether one of *its own* animals changed state. This endpoint
 * carries no cookie at all (DR1-Q2), so unlike a page a real adopter is
 * looking at, nothing about who is calling it is known - a caller is not
 * necessarily reading back its own saved list, and the per-IP rate limit
 * is the only thing standing between it and brute-forcing ids. `name` is
 * therefore the real name only for a row that was listed (not a draft)
 * under a shelter that has been verified at some point (`isListedAnimal`
 * and `hasBeenVerified`, review of 529a6cc, finding 4) - an approximation
 * of "this row was ever public," not that fact exactly: a shelter that was
 * once verified and is now paused or suspended can still publish and
 * withdraw a *new* card entirely inside that window, and its name comes
 * back too even though that specific card was never actually shown
 * (review of 3fce3b7, finding 1 - closing that needs a stored per-listing
 * fact this schema doesn't carry). `name: null` for an id that never
 * resolved to a row, for a draft, and for a listed row under a shelter
 * that has never once been verified.
 */
export const SavedCardResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("available"), animalId: AnimalIdSchema, card: FeedCardViewSchema }),
  z.object({
    kind: z.literal("unavailable"),
    animalId: AnimalIdSchema,
    name: z.string().nullable(),
  }),
]);

export const AnimalsCardsByIdsOutputSchema = z.object({
  items: z.array(SavedCardResultSchema),
});

/**
 * DR1-Q2 option (A), his spec verbatim: "One POST with the ids in the body,
 * credentials: 'omit' (no cookie), at most 200 ids. The per-IP rate limit,
 * the public view only, Cache-Control: no-store. Nothing stored or logged
 * about which ids were asked for." No `UNAUTHENTICATED`: this procedure
 * never reads `context.adopterId` at all, so there is no session to be
 * missing - the saved list is never tied to one (commitment 8's own
 * reasoning, carried here).
 */
export const animalsCardsByIdsContract = oc
  .input(AnimalsCardsByIdsInputSchema)
  .output(AnimalsCardsByIdsOutputSchema)
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });

/**
 * Prev/next for the pet card overlay (pet card PR 2, section B).
 *
 * The context is the gallery the visitor is on, not a property of the
 * animal, so it travels on every call rather than being looked up server
 * side: `filters` and `sort` are the same values `gallery.list` was called
 * with, and the repository reuses its predicate and ordering builders so the
 * two can never drift apart. Still answers correctly for an animal that has
 * since dropped out of that filtered set - the seek key comes from the
 * animal's own row, not from a position in the result set.
 */
export const AnimalsNeighboursInputSchema = z.object({
  animalId: AnimalIdSchema,
  filters: FeedFiltersSchema,
  sort: GallerySortSchema.default(DEFAULT_GALLERY_SORT),
  scope: GalleryScopeSchema.default(EVERYONE_SCOPE),
});

/** Just enough to render a label and link to the next overlay - the full
 * card is a second navigation away, not prefetched into this response. */
export const NeighbourViewSchema = z.object({
  id: AnimalIdSchema,
  name: z.string(),
});

export const AnimalsNeighboursOutputSchema = z.object({
  /**
   * `null` at either end (no wrap-around), and for an unknown `animalId` or
   * one that no longer has a position in this ordering (a draft, adopted or
   * withdrawn animal) - both read the same as "nothing there" to a caller
   * that only wants to know what to link to next.
   */
  prev: NeighbourViewSchema.nullable(),
  next: NeighbourViewSchema.nullable(),
});

export const animalsNeighboursContract = oc
  .input(AnimalsNeighboursInputSchema)
  .output(AnimalsNeighboursOutputSchema)
  .errors({
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });

export const AnimalsRevealInputSchema = z.object({
  animalId: AnimalIdSchema,
});

/**
 * Deliberately separate from `swipes.record`.
 *
 * A reveal is a transactional, idempotent, append-only event: it writes the
 * shelter snapshot the adopter's history depends on, and later it is the entry
 * a reward ledger reads. Recording a swipe is best-effort and batchable. Fusing
 * them would give the cheap call the reliability requirements of the expensive
 * one and the expensive call the guarantees of the cheap one.
 *
 * Calling it twice for the same animal must return the existing reveal rather
 * than creating a second, so a double tap on a card cannot duplicate history.
 */
export const animalsRevealContract = oc
  .input(AnimalsRevealInputSchema)
  .output(ContactRevealViewSchema)
  .errors({
    NOT_FOUND: apiErrors.NOT_FOUND,
    ANIMAL_NOT_AVAILABLE: apiErrors.ANIMAL_NOT_AVAILABLE,
    // Safe here, and only here: the caller was shown this shelter's card, so
    // the refusal explains something they already know about rather than
    // disclosing moderation state for an id they merely guessed.
    SHELTER_NOT_VISIBLE: apiErrors.SHELTER_NOT_VISIBLE,
    UNAUTHENTICATED: apiErrors.UNAUTHENTICATED,
    RATE_LIMITED: apiErrors.RATE_LIMITED,
  });
