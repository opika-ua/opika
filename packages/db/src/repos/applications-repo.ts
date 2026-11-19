import {
  type CityId,
  DISCOVERABLE_LISTING_KINDS,
  type PendingDonation,
  type ShelterContact,
  type ShelterHistoryEntry,
  type ShelterId,
  type ShelterLegalEntity,
  type ShelterVerification,
} from "@opika/domain";
import { and, asc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import { authInvitation, authMember, authUser } from "../schema/auth";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { historyRowSelect } from "./history-sql";

/** One application as the operator's queue reads it (§3), oldest first. */
export type ApplicationRow = {
  shelterId: ShelterId;
  version: number;
  name: string;
  cityId: CityId;
  /** The `applied_at` column itself, so a row whose verification can't be read still sorts. */
  appliedAt: Date | null;
  verification: ShelterVerification;
  /** Null when the registrant gave none (0030). */
  contact: ShelterContact | null;
  /** The registrant's address and `email_verified`; null once that account is erased. */
  registrant: { email: string; emailVerified: boolean } | null;
  drafts: { animals: number; photos: number };
};

/** Every shelter as the duplicate check compares it: names, cities, addresses and links. */
export type DuplicateSourceRow = {
  shelterId: ShelterId;
  name: string;
  cityId: CityId;
  contact: ShelterContact | null;
  verification: ShelterVerification;
  /** Members', invitees' and the registrant's addresses, as stored. */
  emails: readonly string[];
};

export type EarlyListedApplicationRow = {
  shelterId: ShelterId;
  name: string;
  cityId: CityId;
  verification: ShelterVerification;
  earlyListingSince: Date;
};

export type PendingDonationRow = {
  shelterId: ShelterId;
  name: string;
  version: number;
  pendingDonation: PendingDonation;
  legalEntity: ShelterLegalEntity | null;
};

/** The two queue decisions, each exactly the columns it changes. */
export type ApplicationDecisionWrite =
  /** «Схвалити»: to `pending`, its first early-listing period starting with the write (P0-1). */
  | { kind: "accept"; verification: ShelterVerification; earlyListingSince: Date }
  /** «Відхилити»: `application_rejected_at` starts the 30-day clean-up clock. */
  | { kind: "reject"; verification: ShelterVerification; rejectedAt: Date };

const decisionColumns = (decision: ApplicationDecisionWrite) =>
  decision.kind === "accept"
    ? { earlyListingSince: decision.earlyListingSince, applicationRejectedAt: null }
    : { earlyListingSince: null, applicationRejectedAt: decision.rejectedAt };

// A JSON `null` reads as absent too, as the registry list's rank does.
const donationPendingSql = sql`coalesce(jsonb_typeof(${shelters.pendingDonation}), 'null') <> 'null'`;

/**
 * The operator's «Заявки» block (self-registration, §3). Reads are builder queries, `::int` on
 * every count, so `postgres-js` and `neon-http` answer alike; no query per row.
 */
export function applicationsRepo(db: Database) {
  return {
    async pending(): Promise<ApplicationRow[]> {
      const rows = await db
        .select({
          shelterId: shelters.id,
          version: shelters.version,
          name: shelters.displayName,
          cityId: shelters.cityId,
          appliedAt: shelters.appliedAt,
          verification: shelters.verification,
          contact: shelters.contact,
          email: authUser.email,
          emailVerified: authUser.emailVerified,
        })
        .from(shelters)
        .leftJoin(authUser, eq(authUser.id, shelters.registrantUserId))
        .where(eq(shelters.verificationStatus, "application"))
        .orderBy(asc(shelters.appliedAt), asc(shelters.id));
      if (rows.length === 0) return [];
      const counts = await db
        .select({
          shelterId: animals.shelterId,
          animals: sql<number>`(count(*) FILTER (WHERE ${animals.listingKind} = 'draft'))::int`,
          photos: sql<number>`(coalesce(sum(jsonb_array_length(${animals.photos})) FILTER (WHERE ${animals.listingKind} = 'draft'), 0))::int`,
        })
        .from(animals)
        .where(
          inArray(
            animals.shelterId,
            rows.map((row) => row.shelterId),
          ),
        )
        .groupBy(animals.shelterId);
      const draftsOf = new Map(counts.map((row) => [row.shelterId, row]));
      return rows.map((row) => {
        const drafts = draftsOf.get(row.shelterId);
        return {
          shelterId: row.shelterId,
          version: row.version,
          name: row.name,
          cityId: row.cityId as CityId,
          appliedAt: row.appliedAt,
          verification: row.verification,
          contact: row.contact,
          registrant:
            row.email === null || row.emailVerified === null
              ? null
              : { email: row.email, emailVerified: row.emailVerified },
          drafts: { animals: Number(drafts?.animals ?? 0), photos: Number(drafts?.photos ?? 0) },
        };
      });
    },

    /** Who a decision email goes to: the registrant, or nobody once that account is erased. */
    async registrantOf(shelterId: ShelterId): Promise<{ userId: string; email: string } | null> {
      const [row] = await db
        .select({ userId: authUser.id, email: authUser.email })
        .from(shelters)
        .innerJoin(authUser, eq(authUser.id, shelters.registrantUserId))
        .where(eq(shelters.id, shelterId))
        .limit(1);
      return row ?? null;
    },

    /** Every shelter, applications included: a second registration is a duplicate too. */
    async duplicateSources(): Promise<DuplicateSourceRow[]> {
      const [rows, members, invitations] = await Promise.all([
        db
          .select({
            shelterId: shelters.id,
            name: shelters.displayName,
            cityId: shelters.cityId,
            contact: shelters.contact,
            verification: shelters.verification,
            registrantEmail: authUser.email,
          })
          .from(shelters)
          .leftJoin(authUser, eq(authUser.id, shelters.registrantUserId)),
        db
          .select({ shelterId: shelters.id, email: authUser.email })
          .from(shelters)
          .innerJoin(authMember, eq(authMember.organizationId, shelters.organizationId))
          .innerJoin(authUser, eq(authUser.id, authMember.userId)),
        db
          .select({ shelterId: shelters.id, email: authInvitation.email })
          .from(shelters)
          .innerJoin(authInvitation, eq(authInvitation.organizationId, shelters.organizationId)),
      ]);
      const emailsOf = new Map<string, string[]>();
      for (const { shelterId, email } of [...members, ...invitations]) {
        emailsOf.set(shelterId, [...(emailsOf.get(shelterId) ?? []), email]);
      }
      return rows.map((row) => ({
        shelterId: row.shelterId,
        name: row.name,
        cityId: row.cityId as CityId,
        contact: row.contact,
        verification: row.verification,
        emails: [
          ...(emailsOf.get(row.shelterId) ?? []),
          ...(row.registrantEmail === null ? [] : [row.registrantEmail]),
        ],
      }));
    },

    /** Accepted applications with a stored permission; the caller keeps the ones still running. */
    async earlyListed(): Promise<EarlyListedApplicationRow[]> {
      const rows = await db
        .select({
          shelterId: shelters.id,
          name: shelters.displayName,
          cityId: shelters.cityId,
          verification: shelters.verification,
          earlyListingSince: shelters.earlyListingSince,
        })
        .from(shelters)
        .where(
          and(
            eq(shelters.registrationSource, "self_registration"),
            inArray(shelters.verificationStatus, ["pending", "under_review"]),
            isNotNull(shelters.earlyListingSince),
          ),
        )
        .orderBy(asc(shelters.earlyListingSince), asc(shelters.id));
      return rows.flatMap((row) =>
        row.earlyListingSince === null
          ? []
          : [{ ...row, cityId: row.cityId as CityId, earlyListingSince: row.earlyListingSince }],
      );
    },

    /**
     * Proposed donation links waiting for the operator. A suspended shelter's is left out: it was
     * parked there by the suspension and waits for the reinstatement (S4 shows it).
     */
    async pendingDonations(): Promise<PendingDonationRow[]> {
      const rows = await db
        .select({
          shelterId: shelters.id,
          name: shelters.displayName,
          version: shelters.version,
          pendingDonation: shelters.pendingDonation,
          legalEntity: shelters.legalEntity,
        })
        .from(shelters)
        .where(and(donationPendingSql, ne(shelters.verificationStatus, "suspended")))
        .orderBy(asc(shelters.id));
      return rows
        .flatMap((row) =>
          row.pendingDonation === null
            ? []
            : [
                {
                  ...row,
                  pendingDonation: row.pendingDonation,
                  legalEntity: row.legalEntity ?? null,
                },
              ],
        )
        .sort(
          (a, b) => a.pendingDonation.proposedAt.getTime() - b.pendingDonation.proposedAt.getTime(),
        );
    },

    /**
     * One decision as one statement, conditional on the status and the version read: a second
     * tab or a double click updates nothing and so records no history (`lost`). Accepting stamps
     * the shelter's already-public animals as served, as an early-listing allow does.
     */
    async decide(input: {
      shelterId: ShelterId;
      expectedVersion: number;
      decision: ApplicationDecisionWrite;
      entries: readonly { id: string; entry: ShelterHistoryEntry }[];
      now: Date;
    }): Promise<"ok" | "lost"> {
      if (input.entries.length === 0) throw new Error("A queue decision needs its history line");
      const { verification } = input.decision;
      const upd = db.$with("upd").as(
        db
          .update(shelters)
          .set({
            verification,
            verificationStatus: verification.status,
            ...decisionColumns(input.decision),
            version: sql`${shelters.version} + 1`,
            lastUpdatedAt: input.now,
          })
          .where(
            and(
              eq(shelters.id, input.shelterId),
              eq(shelters.version, input.expectedVersion),
              // Defense in depth beside the version check: a decision only ever lands on an open
              // application, even if a later write path forgets to bump the version. Keep both.
              eq(shelters.verificationStatus, "application"),
            ),
          )
          .returning({ id: shelters.id }),
      );
      const served = db.$with("served").as(
        db
          .update(animals)
          .set({ everServedAt: input.now })
          .where(
            and(
              sql`${animals.shelterId} IN (SELECT "id" FROM "upd")`,
              inArray(animals.listingKind, [...DISCOVERABLE_LISTING_KINDS]),
              isNull(animals.everServedAt),
            ),
          )
          .returning({ id: animals.id }),
      );
      const rows = sql.join(
        input.entries.map(
          (row) => sql`SELECT ${historyRowSelect(row, sql`"upd"."id"`)} FROM "upd"`,
        ),
        sql` UNION ALL `,
      );
      const inserted = await db
        .with(...(input.decision.kind === "accept" ? [upd, served] : [upd]))
        .insert(shelterHistory)
        .select(rows)
        .returning({ id: shelterHistory.id });
      return inserted.length === input.entries.length ? "ok" : "lost";
    },
  };
}
