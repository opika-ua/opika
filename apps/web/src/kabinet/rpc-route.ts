import type { Database } from "@opika/db";
import type { LocationPrivacyPolicy } from "@opika/domain";
import { RPCHandler } from "@orpc/server/fetch";
import type { ShelterWritePolicy } from "./access";
import type { KabinetPrincipal } from "./actor";
import type { KabinetAuthAvailability } from "./auth-route";
import { type KabinetLimiters, kabinetIpKey, kabinetUserKey } from "./rate-limits";
import { registryRouter } from "./registry-router";
import { shelterKabinetRouter } from "./router";

/**
 * Both surfaces on one handler (`shelter`, `registry`, `session` are disjoint
 * top-level keys). Each router was built with `implement(...)` over its own
 * contract and is complete, so no stub answers a real route (HS-Q1).
 */
export const kabinetRouter = { ...shelterKabinetRouter, ...registryRouter };

const handler = new RPCHandler(kabinetRouter);

export const KABINET_RPC_PREFIX = "/api/kabinet";

export { KABINET_RATE_LIMITS, type KabinetLimiters } from "./rate-limits";

const tooMany = () => new Response("Too Many Requests", { status: 429 });

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
    resolve: () => Promise<{
      principal: KabinetPrincipal;
      userId: string | null;
      db: Database;
      cursorSecret: string;
    }>;
    limiters: KabinetLimiters;
    ip: string;
    now: Date;
    newId: () => string;
    operatorDisplayName: string;
    locationPolicy: LocationPrivacyPolicy | null;
    production: boolean;
    /** The served route passes `SHELTER_WRITE_POLICY` (KH-Q1). */
    shelterWrites: ShelterWritePolicy;
  },
): Promise<Response> {
  if (!(await deps.limiters.perIp.check(kabinetIpKey(deps.ip), deps.now))) return tooMany();
  if (deps.availability.kind === "unavailable") {
    return new Response("Kabinet is not available", { status: 503 });
  }
  // RG-Q10: without the location key the registry can't create a shelter or
  // move one honestly, so all of it is unavailable rather than half of it.
  const path = new URL(request.url).pathname;
  if (deps.locationPolicy === null && path.startsWith(`${KABINET_RPC_PREFIX}/registry/`)) {
    return new Response("Registry is not available", { status: 503 });
  }
  const { principal, userId, db, cursorSecret } = await deps.resolve();
  if (userId !== null && !(await deps.limiters.perUser.check(kabinetUserKey(userId), deps.now))) {
    return tooMany();
  }
  const setCookies: string[] = [];
  const result = await handler.handle(request, {
    prefix: KABINET_RPC_PREFIX,
    context: {
      db,
      now: deps.now,
      newId: deps.newId,
      principal,
      cursorSecret,
      operatorDisplayName: deps.operatorDisplayName,
      locationPolicy: deps.locationPolicy,
      setCookies,
      cookieHeader: request.headers.get("cookie"),
      production: deps.production,
      shelterWrites: deps.shelterWrites,
    },
  });
  if (!result.matched) return new Response("Not Found", { status: 404 });
  for (const cookie of setCookies) result.response.headers.append("Set-Cookie", cookie);
  return result.response;
}
