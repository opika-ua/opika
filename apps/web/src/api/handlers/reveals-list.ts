import type {
  apiErrors,
  RevealsListMineInputSchema,
  RevealsListMineOutputSchema,
} from "@opika/contracts";
import { revealRepo, shelterRepo } from "@opika/db/repos";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { z } from "zod";
import type { AppContext } from "../context";
import { decodeRevealCursor, encodeRevealCursor } from "../cursor";
import { requireEnv } from "../env";
import { shelterContactOf, toView } from "./reveal";

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
    listOpts.cursor = { revealedAt: decoded.data.at, id: decoded.data.id };
  }

  const items = await reveals.listByAdopter(context.adopterId, listOpts);

  const hasMore = items.length > input.limit;
  const pageItems = hasMore ? items.slice(0, input.limit) : items;

  const last = hasMore ? pageItems[pageItems.length - 1] : undefined;
  const nextCursor = last
    ? (encodeRevealCursor({ at: last.revealedAt, id: last.id }, secret) as Output["nextCursor"])
    : null;

  // One query for the page's shelters, not one per reveal (N+1).
  const shelterIds = [...new Set(pageItems.map((item) => item.shelterId))];
  const byId = new Map(
    (await shelterRepo(context.db).findByIds(shelterIds)).map((shelter) => [shelter.id, shelter]),
  );

  return {
    // The same projection as the reveal itself: no exact address (EM-D1), and
    // the shelter's current contacts while it is visible, else the first-reveal
    // record's, labelled as such (K4-B4, K4-B5).
    items: pageItems.map((item) => toView(item, shelterContactOf(item, byId.get(item.shelterId)))),
    nextCursor,
  };
}
