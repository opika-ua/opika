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
   * Only counted on a fresh feed (`cursorData === null` — the entry fetch or
   * a retry-restart), and only for a caller with a session: the contract's
   * own doc comment on `reachableCount` says why a prefetch must not
   * re-count, and why a caller with no session needs no count at all.
   *
   * Gated on the session alone — not on first asking whether the seen-set
   * is non-empty — so it runs alongside `feed.list` below via `Promise.all`
   * rather than after a second query: awaiting them in sequence would cost a
   * full extra round trip on every fresh deck fetch (real latency on Neon's
   * HTTP driver, the exact class of cost O-9 exists to remove). An adopter
   * with an empty seen-set pays one indexed count for it.
   *
   * A second tab building up its own seen-set concurrently isn't reflected
   * until this tab's next fresh fetch — accepted, as it was for R1: the
   * counter is honest about what this load confirmed.
   */
  const reachableCountPromise: Promise<number | null> =
    cursorData === null && context.adopterId
      ? feed.reachableCount({
          filters: input.filters,
          adopterId: context.adopterId,
          now: context.now,
          seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
        })
      : Promise.resolve(null);

  const [page, reachableCount] = await Promise.all([
    feed.list({
      filters: input.filters,
      cursor: cursorData,
      limit: input.limit,
      adopterId: context.adopterId,
      now: context.now,
      seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
    }),
    reachableCountPromise,
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
    reachableCount,
  };
}
