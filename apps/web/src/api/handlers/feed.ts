import type { apiErrors, FeedListInputSchema, FeedListOutputSchema } from "@opika/contracts";
import { feedRepo, shelterRepo } from "@opika/db/repos";
import {
  ageBucketOf,
  DEFAULT_FRESHNESS_POLICY,
  DEFAULT_SCORING_POLICY,
  DEFAULT_SEEN_SET_POLICY,
  filtersFingerprint,
  freshnessOf,
  primaryPhoto,
  scoreAnimal,
} from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { decodeFeedCursor, encodeFeedCursor } from "../cursor";
import { requireEnv } from "../env";
import { discoverableListingKind } from "./discoverable-listing-kind";

type FeedInput = z.infer<typeof FeedListInputSchema>;
type FeedOutput = z.infer<typeof FeedListOutputSchema>;

/** The exact subset `feedListContract` declares — see animals.ts's own comment (O-20). */
type FeedListErrors = ORPCErrorConstructorMap<{
  INVALID_CURSOR: typeof apiErrors.INVALID_CURSOR;
  RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
}>;

export async function feedList(
  input: FeedInput,
  context: AppContext,
  errors: FeedListErrors,
): Promise<FeedOutput> {
  const secret = requireEnv("CURSOR_HMAC_SECRET");
  const fp = filtersFingerprint(input.filters);

  let cursorData = null;
  if (input.cursor) {
    const decoded = decodeFeedCursor(input.cursor, fp, secret);
    if (!decoded) {
      throw errors.INVALID_CURSOR();
    }
    cursorData = decoded.data;
  }

  const feed = feedRepo(context.db);

  /**
   * Only queried on a fresh feed (`cursorData === null` — the entry fetch
   * or a retry-restart), not on every prefetch. A prefetch doesn't need a
   * fresh answer: if the seen-set was empty when the deck opened, the
   * client already knows locally the moment it records its own first
   * swipe this session (`use-feed-deck.ts`), without asking the server
   * again. `null`, not `false`, for a prefetch — see the contract's own
   * doc comment on why those two are different facts. A second tab (or a
   * second device on the same session) that has already built up a
   * seen-set this tab doesn't know about won't be reflected here until
   * that tab's own next fresh fetch (a reload, or a retry-restart) —
   * accepted, not fixed: the counter is honest about what *this* load
   * has confirmed, not omniscient about every concurrent one.
   *
   * Run alongside `feed.list` below via `Promise.all`, not after it —
   * the two queries don't depend on each other's result, and awaiting
   * them in sequence would cost a full extra round trip on every fresh
   * deck fetch (real latency on Neon's HTTP driver, the exact class of
   * cost O-9 exists to remove).
   */
  const hasActiveSeenSetPromise: Promise<boolean | null> =
    cursorData !== null
      ? Promise.resolve(null)
      : context.adopterId
        ? feed.hasActiveSeenSet(context.adopterId, context.now, DEFAULT_SEEN_SET_POLICY)
        : Promise.resolve(false);

  const [page, hasActiveSeenSet] = await Promise.all([
    feed.list({
      filters: input.filters,
      cursor: cursorData,
      limit: input.limit,
      adopterId: context.adopterId,
      now: context.now,
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    }),
    hasActiveSeenSetPromise,
  ]);

  // Build shelter lookup for the page — single batch query, not N+1
  const shelterIds = [...new Set(page.items.map((a) => a.shelterId))];
  const shelters = shelterRepo(context.db);
  const shelterList = await shelters.findByIds(shelterIds);
  const shelterMap = new Map(shelterList.map((s) => [s.id, s]));

  const items = page.items
    .map((animal) => {
      const shelter = shelterMap.get(animal.shelterId);
      if (!shelter) return null;

      const freshness = freshnessOf(animal.lastUpdatedAt, context.now, DEFAULT_FRESHNESS_POLICY);

      return {
        id: animal.id,
        name: animal.name,
        species: animal.species,
        sex: animal.sex,
        size: animal.size,
        publicLocation: animal.publicLocation,
        ageBucket: ageBucketOf(animal.age, context.now),
        freshness,
        primaryPhoto: primaryPhoto(animal),
        listingKind: discoverableListingKind(animal.listing),
        shelter: {
          id: shelter.id,
          displayName: shelter.displayName,
          publicLocation: shelter.publicLocation,
          freshnessSentence: shelter.freshnessSentence,
          verification:
            shelter.verification.status === "verified"
              ? ("verified" as const)
              : ("unverified" as const),
        },
        _score: scoreAnimal(animal, input.filters, freshness, context.now, DEFAULT_SCORING_POLICY),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b._score - a._score)
    .map(({ _score, ...rest }) => rest);

  const nextCursor = page.nextCursor
    ? (encodeFeedCursor(page.nextCursor, fp, secret) as string)
    : null;

  return {
    items,
    nextCursor: nextCursor as FeedOutput["nextCursor"],
    hasActiveSeenSet,
  };
}
