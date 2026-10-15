import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { authInvitation } from "../schema/auth";
import { shelters } from "../schema/shelters";

/**
 * What the invite landing (`/kabinet/vkhid?zaproshennia=<id>`, IN-Q11) may
 * know about an invitation, read by its id. A read only: the landing never
 * writes an invitation (it sends a magic link through Better Auth, whose
 * only write is its own verification row), and every invitation write stays
 * in `kabinetInvitationRepo` (HS-Q7, RG-Q9).
 */
export type InviteLandingRow =
  | { status: "pending"; email: string; expiresAt: Date; shelterName: string }
  | { status: "accepted" }
  /** Withdrawn, rejected, canceled, or any status Better Auth adds later: not usable. */
  | { status: "other" };

export function kabinetInviteLandingRepo(db: Database) {
  return {
    /** The invitation and its shelter's name, or null for an id nobody issued. */
    async invitationOf(invitationId: string): Promise<InviteLandingRow | null> {
      const [row] = await db
        .select({
          status: authInvitation.status,
          email: authInvitation.email,
          expiresAt: authInvitation.expiresAt,
          shelterName: shelters.displayName,
        })
        .from(authInvitation)
        .innerJoin(shelters, eq(shelters.organizationId, authInvitation.organizationId))
        .where(eq(authInvitation.id, invitationId))
        .limit(1);
      if (row === undefined) return null;
      if (row.status === "accepted") return { status: "accepted" };
      if (row.status !== "pending") return { status: "other" };
      return {
        status: "pending",
        email: row.email,
        expiresAt: row.expiresAt,
        shelterName: row.shelterName,
      };
    },
  };
}
