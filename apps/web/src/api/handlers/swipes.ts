import type {
  apiErrors,
  SwipesRecordInputSchema,
  SwipesRecordOutputSchema,
} from "@opika/contracts";
import { animalRepo, shelterRepo, swipeRepo } from "@opika/db/repos";
import { isDiscoverable } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";

type SwipesInput = z.infer<typeof SwipesRecordInputSchema>;
type SwipesOutput = z.infer<typeof SwipesRecordOutputSchema>;

/** The exact subset `swipesRecordContract` declares - see animals.ts's own comment (O-20). */
type SwipesRecordErrors = ORPCErrorConstructorMap<{
  NOT_FOUND: typeof apiErrors.NOT_FOUND;
  UNAUTHENTICATED: typeof apiErrors.UNAUTHENTICATED;
  RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
}>;

/**
 * Clamp the swipe timestamp to [now - maxOfflineWindow, now].
 * Prevents a device sending year-2999 timestamps from poisoning
 * every recency window.
 */
const MAX_OFFLINE_WINDOW_MS = 7 * 24 * 3600 * 1000; // 7 days

function clampSwipeTime(at: Date, now: Date): Date {
  const earliest = new Date(now.getTime() - MAX_OFFLINE_WINDOW_MS);
  if (at.getTime() > now.getTime()) return now;
  if (at.getTime() < earliest.getTime()) return earliest;
  return at;
}

export async function swipesRecord(
  input: SwipesInput,
  context: AppContext,
  errors: SwipesRecordErrors,
): Promise<SwipesOutput> {
  if (!context.adopterId) {
    throw errors.UNAUTHENTICATED();
  }

  // Only an animal an adopter can be shown: a discoverable listing at a
  // verified shelter, the rule `animals.byId` and the feed apply. Anything else
  // answers NOT_FOUND, exactly like a missing id, so nothing is recorded about
  // a draft, a hidden shelter's animal or a removed one (DR-F1). This is also
  // what lets K-Q9 say a draft with activity "was already published": reveals
  // already refuse non-discoverable animals, and now swipes do too.
  const animals = animalRepo(context.db);
  const animal = await animals.findById(input.animalId);
  if (!animal || !isDiscoverable(animal.listing)) {
    throw errors.NOT_FOUND();
  }
  const shelter = await shelterRepo(context.db).findById(animal.shelterId);
  if (shelter?.verification.status !== "verified") {
    throw errors.NOT_FOUND();
  }

  const clampedAt = clampSwipeTime(input.at, context.now);

  const swipes = swipeRepo(context.db);
  const recorded = await swipes.record({
    adopterId: context.adopterId,
    animalId: input.animalId,
    direction: input.direction,
    at: clampedAt,
  });

  return { recorded };
}
