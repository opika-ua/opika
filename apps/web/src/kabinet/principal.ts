import type { Database } from "@opika/db";
import { kabinetActorRepo } from "@opika/db/repos";
import type { KabinetPrincipal } from "./actor";
import type { KabinetAuth } from "./auth";

/**
 * Who a request is, for the kabinet. Better Auth answers "which user, if
 * any"; the role comes from `super_admins` and `auth_member` only (HS-T2),
 * never from anything on the user record or in the session. An adopter's
 * anonymous cookie is not a kabinet session, so an adopter arrives here as
 * `anonymous`.
 */
export async function principalOf(
  auth: KabinetAuth,
  db: Database,
  headers: Headers,
): Promise<KabinetPrincipal> {
  const session = await auth.api.getSession({ headers });
  if (session === null) return { kind: "anonymous" };
  return kabinetActorRepo(db).roleOf(session.user.id);
}
