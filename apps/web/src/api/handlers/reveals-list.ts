import type { RevealsListMineInputSchema, RevealsListMineOutputSchema } from "@opika/contracts";
import { revealRepo } from "@opika/db/repos";
import { ORPCError } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context.js";
import { decodeRevealCursor, encodeRevealCursor } from "../cursor.js";
import { requireEnv } from "../env.js";

type Input = z.infer<typeof RevealsListMineInputSchema>;
type Output = z.infer<typeof RevealsListMineOutputSchema>;

export async function revealsListMine(input: Input, context: AppContext): Promise<Output> {
  if (!context.adopterId) {
    throw new ORPCError("UNAUTHENTICATED");
  }

  const secret = requireEnv("CURSOR_HMAC_SECRET");
  const reveals = revealRepo(context.db);

  const listOpts: { limit: number; cursor?: Date } = { limit: input.limit + 1 };
  if (input.cursor) {
    const decoded = decodeRevealCursor(input.cursor, secret);
    if (!decoded) {
      throw new ORPCError("INVALID_CURSOR");
    }
    listOpts.cursor = decoded.data.lastUpdatedAt;
  }

  const items = await reveals.listByAdopter(context.adopterId, listOpts);

  const hasMore = items.length > input.limit;
  const pageItems = hasMore ? items.slice(0, input.limit) : items;

  const last = hasMore ? pageItems[pageItems.length - 1] : undefined;
  const nextCursor = last
    ? (encodeRevealCursor(
        { lastUpdatedAt: last.revealedAt, id: last.id },
        secret,
      ) as Output["nextCursor"])
    : null;

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
