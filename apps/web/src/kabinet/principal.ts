import type { Database } from "@opika/db";
import { kabinetActorRepo } from "@opika/db/repos";
import type { KabinetPrincipal } from "./actor";
import { KABINET_SESSION, type KabinetAuth } from "./auth";

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
): Promise<KabinetIdentity> {
  const session = await auth.api.getSession({ headers });
  if (session === null) return { principal: { kind: "anonymous" }, userId: null };
  if (now.getTime() - session.session.createdAt.getTime() > KABINET_SESSION.absoluteMs) {
    return { principal: { kind: "anonymous" }, userId: null };
  }
  return { principal: await kabinetActorRepo(db).roleOf(session.user.id), userId: session.user.id };
}
