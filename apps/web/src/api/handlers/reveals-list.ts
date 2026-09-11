import type {
  apiErrors,
  RevealsListMineInputSchema,
  RevealsListMineOutputSchema,
} from "@opika/contracts";
import { revealRepo } from "@opika/db/repos";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { decodeRevealCursor, encodeRevealCursor } from "../cursor";
import { requireEnv } from "../env";

type Input = z.infer<typeof RevealsListMineInputSchema>;
type Output = z.infer<typeof RevealsListMineOutputSchema>;

/** The exact subset `revealsListMineContract` declares — see animals.ts's own comment (O-20). */
type RevealsListMineErrors = ORPCErrorConstructorMap<{
  INVALID_CURSOR: typeof apiErrors.INVALID_CURSOR;
  UNAUTHENTICATED: typeof apiErrors.UNAUTHENTICATED;
  RATE_LIMITED: typeof apiErrors.RATE_LIMITED;
}>;

export async function revealsListMine(
  input: Input,
  context: AppContext,
  errors: RevealsListMineErrors,
): Promise<Output> {
  if (!context.adopterId) {
    throw errors.UNAUTHENTICATED();
  }

  const secret = requireEnv("CURSOR_HMAC_SECRET");
  const reveals = revealRepo(context.db);

  type RevealCursor = { revealedAt: Date; id: string };
  const listOpts: { limit: number; cursor?: RevealCursor } = { limit: input.limit + 1 };
  if (input.cursor) {
    const decoded = decodeRevealCursor(input.cursor, secret);
    if (!decoded) {
      throw errors.INVALID_CURSOR();
    }
    listOpts.cursor = { revealedAt: decoded.data.lastUpdatedAt, id: decoded.data.id };
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
