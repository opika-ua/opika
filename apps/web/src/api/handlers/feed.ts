import type { FeedListInputSchema, FeedListOutputSchema } from "@opika/contracts";
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
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { decodeFeedCursor, encodeFeedCursor } from "../cursor.js";
import { requireEnv } from "../env.js";

type FeedInput = z.infer<typeof FeedListInputSchema>;
type FeedOutput = z.infer<typeof FeedListOutputSchema>;

export async function feedList(input: FeedInput, context: AppContext): Promise<FeedOutput> {
  const secret = requireEnv("CURSOR_HMAC_SECRET");
  const fp = filtersFingerprint(input.filters);

  let cursorData = null;
  if (input.cursor) {
    const decoded = decodeFeedCursor(input.cursor, fp, secret);
    if (!decoded) {
      throw new ORPCError("INVALID_CURSOR");
    }
    cursorData = decoded.data;
  }

  const feed = feedRepo(context.db);
  const page = await feed.list({
    filters: input.filters,
    cursor: cursorData,
    limit: input.limit,
    adopterId: context.adopterId,
    now: context.now,
    seenSetPolicy: DEFAULT_SEEN_SET_POLICY,
  });

  // Build shelter lookup for the page
  const shelterIds = [...new Set(page.items.map((a) => a.shelterId))];
  const shelters = shelterRepo(context.db);
  const shelterMap = new Map<string, Awaited<ReturnType<typeof shelters.findById>>>();
  for (const id of shelterIds) {
    shelterMap.set(id, await shelters.findById(id));
  }

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
        shelter: {
          id: shelter.id,
          displayName: shelter.displayName,
          publicLocation: shelter.publicLocation,
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
  };
}
