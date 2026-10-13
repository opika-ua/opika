import type { Database } from "@opika/db";
import { kabinetSupportRepo } from "@opika/db/repos";
import type { ModeratorId, ShelterId } from "@opika/domain";
import { hashToken, mintSessionToken } from "../api/session/token";
import type { KabinetPrincipal } from "./actor";

/**
 * Support mode's own cookie (RG-Q4): separate from Better Auth's session, so
 * leaving support is dropping this cookie, never signing out. `__Host-` in
 * production (Secure, Path=/, no Domain); browsers ignore that prefix over
 * plain HTTP, so development drops it, as the adopter session does. A session
 * cookie with no Max-Age: the 30-minute idle rule is the server's, and the
 * view also ends when the browser does.
 */
export function supportCookieName(production: boolean): string {
  return production ? "__Host-kabinet.support" : "kabinet.support";
}

export function setSupportCookie(token: string, production: boolean): string {
  const parts = [`${supportCookieName(production)}=${token}`, "HttpOnly", "SameSite=Lax", "Path=/"];
  if (production) parts.push("Secure");
  return parts.join("; ");
}

export function clearSupportCookie(production: boolean): string {
  const parts = [
    `${supportCookieName(production)}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (production) parts.push("Secure");
  return parts.join("; ");
}

export function supportTokenOf(cookieHeader: string | null, production: boolean): string | null {
  if (!cookieHeader) return null;
  const name = supportCookieName(production);
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

/**
 * Who a super_admin is on this request: themselves, or a support view of the
 * shelter their open support session points at. Only a super_admin can be
 * in support mode; any other principal is returned unchanged, cookie or not,
 * so a stolen support cookie on a shelter admin's browser grants nothing.
 */
export async function withSupportMode(
  db: Database,
  principal: KabinetPrincipal,
  userId: string | null,
  cookieHeader: string | null,
  now: Date,
  production: boolean,
): Promise<KabinetPrincipal> {
  if (principal.kind !== "super_admin" || userId === null) return principal;
  const token = supportTokenOf(cookieHeader, production);
  if (token === null) return principal;
  const shelterId = await kabinetSupportRepo(db).touch({
    tokenHash: hashToken(token),
    operatorUserId: userId,
    now,
  });
  if (shelterId === null) return principal;
  return { kind: "support_view", moderatorId: principal.moderatorId, shelterId };
}

/** `registry.support.enter`: a fresh 256-bit token, stored hashed, handed back as a cookie. */
export async function enterSupport(
  deps: { db: Database; now: Date; newId: () => string; setCookies: string[]; production: boolean },
  moderatorId: ModeratorId,
  shelterId: ShelterId,
): Promise<void> {
  const token = mintSessionToken();
  await kabinetSupportRepo(deps.db).enter({
    id: deps.newId(),
    operatorUserId: moderatorId,
    shelterId,
    tokenHash: hashToken(token),
    now: deps.now,
  });
  deps.setCookies.push(setSupportCookie(token, deps.production));
}

/**
 * `session.exitSupport`, reachable only from an open support view (the
 * access matrix gives it to `support_view` alone). The cookie is cleared even
 * if the row was ended in the meantime. A view that already ended idle
 * resolves to the operator, who gets 403 here and keeps the dead cookie
 * until the browser drops it; the cookie then grants nothing (review of the
 * registry handlers, finding 4).
 */
export async function exitSupport(
  deps: { db: Database; now: Date; setCookies: string[]; production: boolean },
  moderatorId: ModeratorId,
  cookieHeader: string | null,
): Promise<void> {
  const token = supportTokenOf(cookieHeader, deps.production);
  if (token !== null) {
    await kabinetSupportRepo(deps.db).exit({
      tokenHash: hashToken(token),
      operatorUserId: moderatorId,
      now: deps.now,
    });
  }
  deps.setCookies.push(clearSupportCookie(deps.production));
}
