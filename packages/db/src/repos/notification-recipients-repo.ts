import {
  confirmationReminderCutoff,
  DISCOVERABLE_LISTING_KINDS,
  EARLY_LISTING_STATUSES,
  earlyListingCutoff,
  type Shelter,
  type ShelterHistoryEntry,
  type ShelterId,
} from "@opika/domain";
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import { authMember, authUser, superAdmins } from "../schema/auth";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { rowToShelter } from "./mappers";

/** Who a notification email goes to: the account and the address it signs in with. */
export type NotificationRecipient = { userId: string; email: string };

/** A shelter with visible cards nobody has confirmed for the reminder's 14 days. */
export type StaleShelter = { shelterId: ShelterId; displayName: string; staleCards: number };

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

    /** The same, for several shelters in one query, each row naming its shelter. */
    async shelterAdminsOf(
      shelterIds: readonly ShelterId[],
    ): Promise<(NotificationRecipient & { shelterId: ShelterId })[]> {
      if (shelterIds.length === 0) return [];
      return db
        .select({ shelterId: shelters.id, userId: authUser.id, email: authUser.email })
        .from(shelters)
        .innerJoin(authMember, eq(authMember.organizationId, shelters.organizationId))
        .innerJoin(authUser, eq(authUser.id, authMember.userId))
        .where(inArray(shelters.id, [...shelterIds]))
        .orderBy(asc(shelters.id), asc(authMember.createdAt), asc(authUser.id));
    },

    /**
     * Shelters the weekly reminder may name: one grouped query over the cards, no query per
     * shelter. A card counts when it is visible (published or reserved) and its last confirmation
     * is at or before the 14-day cut-off. A shelter counts only while it is publicly listed
     * (verified, or inside a running early-listing period) and has not been switched off;
     * paused, suspended, rejected and unlisted ones never appear. `onlyShelter` narrows the same
     * query for a retry.
     */
    async freshnessReminderDue(
      now: Date,
      options: { onlyShelter?: ShelterId } = {},
    ): Promise<StaleShelter[]> {
      const staleCards = sql<number>`count(*)`.mapWith(Number);
      const rows = await db
        .select({
          shelterId: animals.shelterId,
          displayName: shelters.displayName,
          staleCards,
        })
        .from(animals)
        .innerJoin(shelters, eq(shelters.id, animals.shelterId))
        .where(
          and(
            inArray(animals.listingKind, [...DISCOVERABLE_LISTING_KINDS]),
            lte(animals.lastConfirmedAt, confirmationReminderCutoff(now)),
            isNull(shelters.freshnessReminderOffAt),
            or(
              eq(shelters.verificationStatus, "verified"),
              and(
                inArray(shelters.verificationStatus, [...EARLY_LISTING_STATUSES]),
                gt(shelters.earlyListingSince, earlyListingCutoff(now)),
              ),
            ),
            options.onlyShelter === undefined
              ? undefined
              : eq(animals.shelterId, options.onlyShelter),
          ),
        )
        .groupBy(animals.shelterId, shelters.displayName)
        .orderBy(asc(animals.shelterId));
      return rows.map((row) => ({
        shelterId: row.shelterId as ShelterId,
        displayName: row.displayName,
        staleCards: row.staleCards,
      }));
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
