import {
  EARLY_LISTING_STATUSES,
  earlyListingCutoff,
  type Shelter,
  type ShelterHistoryEntry,
  type ShelterId,
} from "@opika/domain";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { authMember, authUser, superAdmins } from "../schema/auth";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { rowToShelter } from "./mappers";

/** Who a notification email goes to: the account and the address it signs in with. */
export type NotificationRecipient = { userId: string; email: string };

/**
 * The reads behind notification emails (`apps/web/src/kabinet/notify`). Builder queries only, so
 * the result shape is the same on `postgres-js` and `neon-http`. Addresses are read at send time
 * and never stored by the send log.
 */
export function notificationRecipientsRepo(db: Database) {
  return {
    /** Every active operator grant (`revoked_at IS NULL`): the operator's own sign-in address. */
    async operators(): Promise<NotificationRecipient[]> {
      return db
        .select({ userId: authUser.id, email: authUser.email })
        .from(superAdmins)
        .innerJoin(authUser, eq(authUser.id, superAdmins.userId))
        .where(isNull(superAdmins.revokedAt))
        .orderBy(asc(authUser.id));
    },

    /** Members of the shelter's organization only: an invitee who has not accepted has no membership. */
    async shelterAdmins(shelterId: ShelterId): Promise<NotificationRecipient[]> {
      return db
        .select({ userId: authUser.id, email: authUser.email })
        .from(shelters)
        .innerJoin(authMember, eq(authMember.organizationId, shelters.organizationId))
        .innerJoin(authUser, eq(authUser.id, authMember.userId))
        .where(eq(shelters.id, shelterId))
        .orderBy(asc(authMember.createdAt), asc(authUser.id));
    },

    /** One account, for a retry whose row names only the user id. Null once the account is erased. */
    async userById(userId: string): Promise<NotificationRecipient | null> {
      const rows = await db
        .select({ userId: authUser.id, email: authUser.email })
        .from(authUser)
        .where(eq(authUser.id, userId))
        .limit(1);
      return rows[0] ?? null;
    },

    /** The history line a mail was planned from, to rebuild it on a retry. */
    async historyEntry(
      historyId: string,
    ): Promise<{ shelterId: ShelterId; entry: ShelterHistoryEntry } | null> {
      const rows = await db
        .select({ shelterId: shelterHistory.shelterId, entry: shelterHistory.entry })
        .from(shelterHistory)
        .where(eq(shelterHistory.id, historyId))
        .limit(1);
      return rows[0] ?? null;
    },

    /**
     * Shelters whose early-listing permission is stored, in a status where it acts, and not yet
     * past its 60 days. The caller applies `earlyListingRemaining`, the one rule for "7 days
     * left", so the SQL never restates it. Soonest to expire first.
     */
    async earlyListingRunning(now: Date): Promise<Shelter[]> {
      const rows = await db
        .select()
        .from(shelters)
        .where(
          and(
            inArray(shelters.verificationStatus, [...EARLY_LISTING_STATUSES]),
            gt(shelters.earlyListingSince, earlyListingCutoff(now)),
          ),
        )
        .orderBy(asc(shelters.earlyListingSince), asc(shelters.id));
      return rows.map(rowToShelter);
    },
  };
}
