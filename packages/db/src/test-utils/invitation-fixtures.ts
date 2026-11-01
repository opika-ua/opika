import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { authInvitation } from "../schema/auth";

/**
 * Test-only: flips an invitation to `accepted`, matching what the real
 * accept flow (`kabinet-invitation-accept-repo.ts`) does atomically with
 * creating the membership - a real accepted admin's own invitation is never
 * still `pending`. Exists so a fixture that creates an already-accepted
 * admin via a direct `authMember` insert (rather than running the real
 * accept flow end to end) doesn't leave a stale `pending` invitation behind,
 * which `erasableIf`'s `noLiveInvitationElsewhere` check would then
 * (correctly) treat as a live invitation elsewhere. `apps/web` never
 * imports `drizzle-orm` directly; this is the one place that needs to.
 */
export async function markInvitationAccepted(db: Database, invitationId: string): Promise<void> {
  await db
    .update(authInvitation)
    .set({ status: "accepted" })
    .where(eq(authInvitation.id, invitationId));
}
