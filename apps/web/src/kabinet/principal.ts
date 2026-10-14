import type { Database } from "@opika/db";
import { kabinetActorRepo } from "@opika/db/repos";
import type { KabinetPrincipal } from "./actor";
import { KABINET_SESSION, type KabinetAuth } from "./auth";
import { withSupportMode } from "./support";

/**
 * Who a request is, for the kabinet. Better Auth answers "which user, if
 * any"; the role comes from `super_admins` and `auth_member` only (HS-T2),
 * never from anything on the user record or in the session. An adopter's
 * anonymous cookie is not a kabinet session, so an adopter arrives here as
 * `anonymous`.
 *
 * A session older than `KABINET_SESSION.absoluteMs` is `anonymous` too, even
 * if Better Auth's sliding expiry would keep it alive (HS-Q8: 30 days
 * absolute, as decision #13). Better Auth has no absolute cap of its own.
 */
export type KabinetIdentity = {
  principal: KabinetPrincipal;
  /**
   * The signed-in Better Auth user, whatever their role (null when the
   * principal is `anonymous`). Keys the per-user rate limit (HS-Q10), which
   * applies to every authenticated caller, `no_role` included.
   */
  userId: string | null;
};

export async function kabinetIdentityOf(
  auth: KabinetAuth,
  db: Database,
  headers: Headers,
  now: Date,
  production: boolean,
): Promise<KabinetIdentity> {
  const userId = await kabinetSessionUserIdOf(auth, headers, now);
  if (userId === null) return { principal: { kind: "anonymous" }, userId: null };
  const role = await kabinetActorRepo(db).roleOf(userId);
  // A super_admin with an open support session is a support view (RG-Q4).
  const principal = await withSupportMode(db, role, userId, headers.get("cookie"), now, production);
  return { principal, userId };
}

/**
 * The signed-in Better Auth user, or null: a live session within the 30-day
 * absolute cap. Only the session read, no role lookup: what the per-user rate
 * limit keys on (HS-Q10), and all a `/kabinet` page load needs before it is
 * charged against that budget (KH-Q8).
 */
export async function kabinetSessionUserIdOf(
  auth: KabinetAuth,
  headers: Headers,
  now: Date,
): Promise<string | null> {
  const session = await auth.api.getSession({ headers });
  if (session === null) return null;
  if (now.getTime() - session.session.createdAt.getTime() > KABINET_SESSION.absoluteMs) {
    return null;
  }
  return session.user.id;
}
