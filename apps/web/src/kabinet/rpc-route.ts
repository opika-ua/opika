import { KABINET_MAX_BODY_BYTES } from "@opika/contracts";
import type { Database } from "@opika/db";
import type { LocationPrivacyPolicy } from "@opika/domain";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import { ipRateLimitKey } from "../api/rate-limit-key";
import type { ShelterWritePolicy } from "./access";
import type { KabinetPrincipal } from "./actor";
import type { KabinetAuthAvailability } from "./auth-route";
import { isSameOriginPost } from "./confirm-route";
import { PHOTO_UPLOADS_NOT_CONFIGURED, type PhotoUploads } from "./photo-uploads";
import { type KabinetLimiters, kabinetUserKey } from "./rate-limits";
import { registryRouter } from "./registry-router";
import { shelterKabinetRouter } from "./router";

/**
 * Both surfaces on one handler (`shelter`, `registry`, `session` are disjoint
 * top-level keys). Each router was built with `implement(...)` over its own
 * contract and is complete, so no stub answers a real route (HS-Q1).
 */
export const kabinetRouter = { ...shelterKabinetRouter, ...registryRouter };

/**
 * `BodyLimitPlugin` holds the body ceiling inside oRPC too (P-Q7). The route
 * already refuses an oversized body before this handler runs
 * (`boundedBody`), so this is the second line, kept for any future caller
 * that reaches the handler another way.
 */
export const kabinetRpcHandler = new RPCHandler(kabinetRouter, {
  plugins: [new BodyLimitPlugin({ maxBodySize: KABINET_MAX_BODY_BYTES })],
});

export const KABINET_RPC_PREFIX = "/api/kabinet";

const tooMany = () => new Response("Too Many Requests", { status: 429 });
const tooLarge = () => new Response("Payload Too Large", { status: 413 });

/**
 * The request with its body read into memory, or `too_large` as soon as it
 * is known to exceed `KABINET_MAX_BODY_BYTES` (P-Q7): by a declared
 * `Content-Length` without reading a byte, or, for a body without one
 * (chunked), by counting while reading and stopping at the first byte over.
 * Either way before any session is looked up or any database touched, so an
 * oversized upload costs a read of at most the ceiling and nothing else.
 *
 * A declared length is not trusted to be honest: the count runs on every
 * body, so one that claims less than it sends is refused all the same.
 */
async function boundedBody(request: Request): Promise<Request | "too_large"> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > KABINET_MAX_BODY_BYTES) return "too_large";
  if (request.body === null) return request;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > KABINET_MAX_BODY_BYTES) {
      await reader.cancel();
      return "too_large";
    }
    chunks.push(value);
  }
  const headers = new Headers(request.headers);
  // The buffered body sets its own length; a chunked framing header no longer applies.
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: Buffer.concat(chunks),
  });
}

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
    /** The served route passes `shelterWritePolicyOf(process.env)` (KH-Q1, K-Q17). */
    shelterWrites: ShelterWritePolicy;
    /**
     * The served route passes the deployment's setup (`photoUploadConfigOf`).
     * Left out, uploads are off: a caller that doesn't say can't store.
     */
    photoUploads?: PhotoUploads;
  },
): Promise<Response> {
  if (!(await deps.limiters.perIp.check(ipRateLimitKey(deps.ip), deps.now))) return tooMany();
  if (deps.availability.kind === "unavailable") {
    return new Response("Kabinet is not available", { status: 503 });
  }
  // K-Q8 (Oleksii, 2026-10-15): every call must come from the site's own
  // pages. SameSite=Lax cookies and oRPC's refusal of GET already keep a
  // cross-site form or link from acting as a signed-in admin; this is the
  // explicit check, the same one the confirm page and invite landing make
  // (`isSameOriginPost`), before any session is resolved. Browsers send
  // Origin on every POST, fetch included; a request without one is refused.
  if (!isSameOriginPost(request.headers.get("origin"), deps.availability.baseURL)) {
    return new Response("Forbidden", { status: 403 });
  }
  const bounded = await boundedBody(request);
  if (bounded === "too_large") return tooLarge();
  // RG-Q10: without the location key the registry can't create a shelter or
  // move one honestly, so all of it is unavailable rather than half of it.
  const path = new URL(bounded.url).pathname;
  if (deps.locationPolicy === null && path.startsWith(`${KABINET_RPC_PREFIX}/registry/`)) {
    return new Response("Registry is not available", { status: 503 });
  }
  const { principal, userId, db, cursorSecret } = await deps.resolve();
  if (userId !== null && !(await deps.limiters.perUser.check(kabinetUserKey(userId), deps.now))) {
    return tooMany();
  }
  const setCookies: string[] = [];
  const result = await kabinetRpcHandler.handle(bounded, {
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
      cookieHeader: bounded.headers.get("cookie"),
      production: deps.production,
      invites: deps.availability.invites,
      linkBaseURL: deps.availability.baseURL,
      shelterWrites: deps.shelterWrites,
      photoUploads: deps.photoUploads ?? PHOTO_UPLOADS_NOT_CONFIGURED,
    },
  });
  if (!result.matched) return new Response("Not Found", { status: 404 });
  for (const cookie of setCookies) result.response.headers.append("Set-Cookie", cookie);
  return result.response;
}
