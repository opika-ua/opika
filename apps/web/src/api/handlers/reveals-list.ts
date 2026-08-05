import type { RevealsListMineInputSchema, RevealsListMineOutputSchema } from "@opika/contracts";
import { revealRepo } from "@opika/db/repos";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context.js";

type Input = z.infer<typeof RevealsListMineInputSchema>;
type Output = z.infer<typeof RevealsListMineOutputSchema>;

export async function revealsListMine(input: Input, context: AppContext): Promise<Output> {
  if (!context.adopterId) {
    throw new ORPCError("UNAUTHENTICATED");
  }

  const reveals = revealRepo(context.db);

  // Simple cursor: the revealedAt of the last item
  const listOpts: { limit: number; cursor?: Date } = { limit: input.limit + 1 };
  if (input.cursor) {
    const ts = new Date(input.cursor);
    if (Number.isNaN(ts.getTime())) {
      throw new ORPCError("INVALID_CURSOR");
    }
    listOpts.cursor = ts;
  }

  const items = await reveals.listByAdopter(context.adopterId, listOpts);

  const hasMore = items.length > input.limit;
  const pageItems = hasMore ? items.slice(0, input.limit) : items;

  const last = hasMore ? pageItems[pageItems.length - 1] : undefined;
  const nextCursor = last ? (last.revealedAt.toISOString() as Output["nextCursor"]) : null;

  return {
    items: pageItems.map((r) => ({
      id: r.id,
      animalId: r.animalId,
      revealedAt: r.revealedAt,
      shelterSnapshot: r.shelterSnapshot,
      animalSnapshot: r.animalSnapshot,
    })),
    nextCursor,
  };
}
