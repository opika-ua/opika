import type { Database } from "@opika/db";
import { RPCHandler } from "@orpc/server/fetch";
import type { KabinetPrincipal } from "./actor";
import type { KabinetAuthAvailability } from "./auth-route";
import { shelterKabinetRouter } from "./router";

const handler = new RPCHandler(shelterKabinetRouter);

export const KABINET_RPC_PREFIX = "/api/kabinet";

/**
 * Everything `/api/kabinet/*` does, as a function the tests call with a real
 * `Request`. Unavailable sign-in means unavailable kabinet (503, same as the
 * auth route): there is no session to act as, so nothing to serve.
 *
 * The principal is resolved by the caller (the route asks Better Auth; tests
 * pass one directly), so the router and every handler are exercised exactly
 * as served, with only identity injected.
 */
export async function handleKabinetRpc(
  request: Request,
  deps: {
    availability: KabinetAuthAvailability;
    /** Resolved only once the kabinet is known to be available. */
    resolve: () => Promise<{ principal: KabinetPrincipal; db: Database; cursorSecret: string }>;
    now: Date;
    newId: () => string;
  },
): Promise<Response> {
  if (deps.availability.kind === "unavailable") {
    return new Response("Kabinet is not available", { status: 503 });
  }
  const { principal, db, cursorSecret } = await deps.resolve();
  const result = await handler.handle(request, {
    prefix: KABINET_RPC_PREFIX,
    context: { db, now: deps.now, newId: deps.newId, principal, cursorSecret },
  });
  return result.matched ? result.response : new Response("Not Found", { status: 404 });
}
