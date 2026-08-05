import type { SwipesRecordInputSchema, SwipesRecordOutputSchema } from "@opika/contracts";
import { animalRepo, swipeRepo } from "@opika/db/repos";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";

type SwipesInput = z.infer<typeof SwipesRecordInputSchema>;
type SwipesOutput = z.infer<typeof SwipesRecordOutputSchema>;

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

export async function swipesRecord(input: SwipesInput, context: AppContext): Promise<SwipesOutput> {
  if (!context.adopterId) {
    throw new ORPCError("NOT_FOUND");
  }

  const animals = animalRepo(context.db);
  const animal = await animals.findById(input.animalId);
  if (!animal) {
    throw new ORPCError("NOT_FOUND");
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
