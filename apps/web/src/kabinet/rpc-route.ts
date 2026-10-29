import { KABINET_MAX_BODY_BYTES } from "@opika/contracts";
import type { Database } from "@opika/db";
import type { LocationPrivacyPolicy } from "@opika/domain";
import { BodyLimitPlugin, RPCHandler } from "@orpc/server/fetch";
import { boundedBody } from "../api/bounded-body";
import { ipRateLimitKey } from "../api/rate-limit-key";
import type { ShelterWritePolicy } from "./access";
import type { KabinetPrincipal } from "./actor";
import { kabinetCookieName } from "./auth";
import type { KabinetAuthAvailability } from "./auth-route";
import { isSameOriginPost } from "./confirm-route";
import { invitationRouter } from "./invitation-router";
import { INVITE_PASSWORDS_OFF, type InvitePasswords } from "./invite-password";
import { PHOTO_UPLOADS_NOT_CONFIGURED, type PhotoUploads } from "./photo-uploads";
import { type KabinetLimiters, kabinetUserKey } from "./rate-limits";
import { registryRouter } from "./registry-router";
import { shelterKabinetRouter } from "./router";

/**
 * Every surface on one handler (`shelter`, `registry`, `session`, `invitation` are disjoint
 * top-level keys). Each router was built with `implement(...)` over its own
 * contract and is complete, so no stub answers a real route (HS-Q1).
 */
export const kabinetRouter = { ...shelterKabinetRouter, ...registryRouter, ...invitationRouter };

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
const unauthorized = () => new Response("Unauthorized", { status: 401 });

/**
 * The paths a caller with no session may use: the `invitation_link` procedures
 * (PW-2), whose token is the credential. Read from the served router's own
 * access meta, so a new anonymous procedure can't be forgotten here.
 */
function anonymousPathsOf(node: unknown, path: readonly string[] = []): string[] {
  if (typeof node !== "object" || node === null) return [];
  if ("~orpc" in node) {
    const meta = (node as { "~orpc": { meta?: { access?: { surface?: string } | null } } })["~orpc"]
      .meta;
    return meta?.access?.surface === "invitation_link"
      ? [`${KABINET_RPC_PREFIX}/${path.join("/")}`]
      : [];
  }
  return Object.entries(node).flatMap(([key, child]) => anonymousPathsOf(child, [...path, key]));
}

export const KABINET_ANONYMOUS_PATHS: ReadonlySet<string> = new Set(
  anonymousPathsOf(kabinetRouter),
);

const SESSION_COOKIE_NAMES: ReadonlySet<string> = new Set([
  kabinetCookieName("session_token", true),
  kabinetCookieName("session_token", false),
]);

/** Whether a non-empty kabinet session cookie is present. Presence only: `resolve` checks it. */
function hasSessionCookie(cookieHeader: string | null): boolean {
  return (cookieHeader ?? "").split(";").some((pair) => {
    const at = pair.indexOf("=");
    return (
      at > 0 &&
      SESSION_COOKIE_NAMES.has(pair.slice(0, at).trim()) &&
      pair.slice(at + 1).trim() !== ""
    );
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
    /** The served route passes `SHELTER_WRITE_POLICY`. */
    shelterWrites: ShelterWritePolicy;
    /**
     * The served route passes the deployment's setup (`photoUploadConfigOf`).
     * Left out, uploads are off: a caller that doesn't say can't store.
     */
    photoUploads?: PhotoUploads;
    /**
     * The invitation link's «Створіть пароль» (PW-2). Called only once the kabinet is known to be
     * available, since it needs Better Auth. Left out, it is off: the procedure answers that the
     * link can't be used.
     */
    invitePasswords?: () => InvitePasswords;
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
  // P-Q7: an oversized declared body is refused first, before anything is read.
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > KABINET_MAX_BODY_BYTES) return tooLarge();
  // Audit F9 (owner, 2026-10-28): no session cookie, no body read and no database,
  // except on the invitation link. The real session lookup stays below.
  const path = new URL(request.url).pathname;
  if (!KABINET_ANONYMOUS_PATHS.has(path) && !hasSessionCookie(request.headers.get("cookie"))) {
    return unauthorized();
  }
  // P-Q7: before any session is looked up or any database touched, so an
  // oversized upload costs a read of at most the ceiling and nothing else.
  const bounded = await boundedBody(request, KABINET_MAX_BODY_BYTES);
  if (bounded === "too_large") return tooLarge();
  // RG-Q10: without the location key the registry can't create a shelter or
  // move one honestly, so all of it is unavailable rather than half of it.
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
      invitePasswords: deps.invitePasswords?.() ?? INVITE_PASSWORDS_OFF,
    },
  });
  if (!result.matched) return new Response("Not Found", { status: 404 });
  for (const cookie of setCookies) result.response.headers.append("Set-Cookie", cookie);
  return result.response;
}
