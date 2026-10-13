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
export async function principalOf(
  auth: KabinetAuth,
  db: Database,
  headers: Headers,
  now: Date,
): Promise<KabinetPrincipal> {
  const session = await auth.api.getSession({ headers });
  if (session === null) return { kind: "anonymous" };
  if (now.getTime() - session.session.createdAt.getTime() > KABINET_SESSION.absoluteMs) {
    return { kind: "anonymous" };
  }
  return kabinetActorRepo(db).roleOf(session.user.id);
}
