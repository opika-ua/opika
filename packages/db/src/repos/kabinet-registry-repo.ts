import { type ShelterId, VERIFICATION_STATUSES, type VerificationStatus } from "@opika/domain";
import { and, eq, ilike, notExists, sql } from "drizzle-orm";
import { alias, union } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import { animals } from "../schema/animals";
import { authInvitation, authMember, authUser } from "../schema/auth";
import { shelters } from "../schema/shelters";

/**
 * S1's order (KABINET: "things awaiting the operator first, then by name"):
 * a rank, the display name, the id. Rank 0 is anything waiting on the
 * operator: a shelter in `pending` or `under_review`, or one with a donation
 * link proposed and not yet decided (N20). Everything else is rank 1.
 */
export type RegistryListPosition = { rank: 0 | 1; name: string; id: ShelterId };

export type RegistryShelterRow = {
  id: ShelterId;
  displayName: string;
  createdAt: Date;
  status: VerificationStatus;
  cityId: string;
  animalCount: number;
  /** Counted the way `adminsOf` lists them (R-UI answer 2): members, and pending invitations without one. */
  admins: { joined: number; invited: number };
  /** A proposed donation link is waiting for the operator: half of why rank can be 0. */
  donationPending: boolean;
  rank: 0 | 1;
};

/** One admin of a shelter as the operator sees it (S4): a member, or an invitation still pending. */
export type RegistryAdminRow = {
  userId: string;
  name: string;
  email: string;
  invite: { status: "pending"; expiresAt: Date } | { status: "accepted" };
};

// A pending donation is stored as SQL NULL when absent; `jsonb_typeof` also
// treats a JSON `null` as absent, so the rank never depends on which one a
// writer happened to produce. One predicate for the rank and the row's flag,
// so the row can never say "no link waiting" while sorting first for one.
const donationPendingSql = sql`coalesce(jsonb_typeof(${shelters.pendingDonation}), 'null') <> 'null'`;
const rankSql = sql<number>`(CASE WHEN ${shelters.verificationStatus} IN ('pending', 'under_review') OR ${donationPendingSql} THEN 0 ELSE 1 END)`;

/**
 * Every organization's admins, counted exactly as `adminsOf` lists them (R-UI
 * answer 2: "in one query (no N+1)"): one grouped subquery the list page
 * joins, as it joins the animal counts, never a query per row.
 *
 * The people are a UNION (not UNION ALL) of members (joined = 1) and users
 * with a pending invitation to the organization and no membership in it
 * (joined = 0). An expired invitation is still `pending` and counts as
 * invited, as S4 lists it (with a resend). The union's own dedup is what
 * counts a re-invited address once; a member's stale pending invitation is
 * excluded by the NOT EXISTS, so a member counts once, as joined. Members are
 * unique per user (`auth_member_user_id_unique`), so they need no dedup.
 *
 * Integers, not booleans, for the joined flag, and `::int` on the counts, so
 * both drivers (postgres-js locally, neon-http in production) hand back the
 * same plain numbers.
 */
function adminCountsOf(db: Database) {
  const sameOrganizationMember = alias(authMember, "same_organization_member");
  const members = db
    .select({
      organizationId: authMember.organizationId,
      userId: authUser.id,
      joined: sql<number>`1`.as("joined"),
    })
    .from(authMember)
    .innerJoin(authUser, eq(authUser.id, authMember.userId));
  const invitees = db
    .select({
      organizationId: authInvitation.organizationId,
      userId: authUser.id,
      joined: sql<number>`0`.as("joined"),
    })
    .from(authInvitation)
    .innerJoin(authUser, eq(authUser.email, authInvitation.email))
    .where(
      and(
        eq(authInvitation.status, "pending"),
        notExists(
          db
            .select({ one: sql`1` })
            .from(sameOrganizationMember)
            .where(
              and(
                eq(sameOrganizationMember.organizationId, authInvitation.organizationId),
                eq(sameOrganizationMember.userId, authUser.id),
              ),
            ),
        ),
      ),
    );
  const people = union(members, invitees).as("admin_people");
  return db
    .select({
      organizationId: people.organizationId,
      joined: sql<number>`(count(*) FILTER (WHERE ${people.joined} = 1))::int`.as("joined_count"),
      invited: sql<number>`(count(*) FILTER (WHERE ${people.joined} = 0))::int`.as("invited_count"),
    })
    .from(people)
    .groupBy(people.organizationId)
    .as("admin_counts");
}

/** `%` and `_` in a search are literal characters, not wildcards. */
const containsPattern = (search: string): string =>
  `%${search.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;

/**
 * The operator's reads over every shelter (`registry.*`). Never scoped by an
 * actor: only a super_admin reaches these, and the access middleware has
 * already decided that. Keyset, never OFFSET (standing constraints).
 */
export function kabinetRegistryRepo(db: Database) {
  return {
    async listPage(input: {
      search: string | null;
      status: VerificationStatus | null;
      after: RegistryListPosition | null;
      limit: number;
    }): Promise<{ items: RegistryShelterRow[]; next: RegistryListPosition | null }> {
      const conditions = [];
      if (input.search !== null)
        conditions.push(ilike(shelters.displayName, containsPattern(input.search)));
      if (input.status !== null) conditions.push(eq(shelters.verificationStatus, input.status));
      if (input.after !== null) {
        conditions.push(
          sql`(${rankSql}, ${shelters.displayName}, ${shelters.id}) > (${input.after.rank}, ${input.after.name}, ${input.after.id})`,
        );
      }
      const animalCount = db
        .select({ shelterId: animals.shelterId, count: sql<number>`count(*)::int`.as("count") })
        .from(animals)
        .groupBy(animals.shelterId)
        .as("animal_counts");
      const adminCounts = adminCountsOf(db);
      const rows = await db
        .select({
          id: shelters.id,
          displayName: shelters.displayName,
          createdAt: shelters.createdAt,
          status: shelters.verificationStatus,
          cityId: shelters.cityId,
          animalCount: sql<number>`coalesce(${animalCount.count}, 0)`,
          adminsJoined: sql<number>`coalesce(${adminCounts.joined}, 0)`,
          adminsInvited: sql<number>`coalesce(${adminCounts.invited}, 0)`,
          donationPending: sql<number>`(CASE WHEN ${donationPendingSql} THEN 1 ELSE 0 END)`,
          rank: rankSql,
        })
        .from(shelters)
        .leftJoin(animalCount, eq(animalCount.shelterId, shelters.id))
        // A shelter with no organization yet (never invited anyone) joins nothing: 0 and 0.
        .leftJoin(adminCounts, eq(adminCounts.organizationId, shelters.organizationId))
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(rankSql, shelters.displayName, shelters.id)
        .limit(input.limit + 1);
      const page = rows
        .slice(0, input.limit)
        .map(({ adminsJoined, adminsInvited, donationPending, ...row }) => ({
          ...row,
          animalCount: Number(row.animalCount),
          admins: { joined: Number(adminsJoined), invited: Number(adminsInvited) },
          donationPending: Number(donationPending) === 1,
          rank: Number(row.rank) === 0 ? (0 as const) : (1 as const),
        }));
      const last = page.at(-1);
      return {
        items: page,
        next:
          rows.length > input.limit && last
            ? { rank: last.rank, name: last.displayName, id: last.id }
            : null,
      };
    },

    /**
     * The status chips' counts. They follow the search (the chips describe
     * what the search found) but not the status filter, or every chip but
     * the selected one would read 0.
     */
    async statusCounts(search: string | null): Promise<Record<VerificationStatus, number>> {
      const rows = await db
        .select({ status: shelters.verificationStatus, count: sql<number>`count(*)::int` })
        .from(shelters)
        .where(search === null ? undefined : ilike(shelters.displayName, containsPattern(search)))
        .groupBy(shelters.verificationStatus);
      const counts = Object.fromEntries(VERIFICATION_STATUSES.map((s) => [s, 0])) as Record<
        VerificationStatus,
        number
      >;
      for (const row of rows) counts[row.status] = Number(row.count);
      return counts;
    },

    /** The shelter's Better Auth organization, null until its first invite. */
    async organizationIdOf(shelterId: ShelterId): Promise<string | null> {
      const [row] = await db
        .select({ organizationId: shelters.organizationId })
        .from(shelters)
        .where(eq(shelters.id, shelterId))
        .limit(1);
      return row?.organizationId ?? null;
    },

    /**
     * The shelter's admins: every member of its organization, then every
     * invitation still `pending` (expired ones included, so S4 can offer a
     * resend). A pending invitation always has a user (RG-Q3 creates it), so
     * both kinds are keyed by user id, which is what `ShelterAdminId` is.
     */
    async adminsOf(shelterId: ShelterId): Promise<RegistryAdminRow[]> {
      const [shelter] = await db
        .select({ organizationId: shelters.organizationId })
        .from(shelters)
        .where(eq(shelters.id, shelterId))
        .limit(1);
      if (shelter?.organizationId == null) return [];
      const organizationId = shelter.organizationId;
      const [members, invitations] = await Promise.all([
        db
          .select({ userId: authUser.id, name: authUser.name, email: authUser.email })
          .from(authMember)
          .innerJoin(authUser, eq(authUser.id, authMember.userId))
          .where(eq(authMember.organizationId, organizationId))
          .orderBy(authMember.createdAt, authUser.id),
        db
          .select({
            userId: authUser.id,
            name: authUser.name,
            email: authUser.email,
            expiresAt: authInvitation.expiresAt,
          })
          .from(authInvitation)
          .innerJoin(authUser, eq(authUser.email, authInvitation.email))
          .where(
            and(
              eq(authInvitation.organizationId, organizationId),
              eq(authInvitation.status, "pending"),
            ),
          )
          .orderBy(authInvitation.createdAt, authInvitation.id),
      ]);
      const memberIds = new Set(members.map((member) => member.userId));
      const pending = new Map<string, RegistryAdminRow>();
      for (const invitation of invitations) {
        // A member with a stale pending invitation is a member; a re-invited
        // address shows once, with its latest expiry.
        if (memberIds.has(invitation.userId)) continue;
        pending.set(invitation.userId, {
          userId: invitation.userId,
          name: invitation.name,
          email: invitation.email,
          invite: { status: "pending", expiresAt: invitation.expiresAt },
        });
      }
      return [
        ...members.map((member) => ({ ...member, invite: { status: "accepted" as const } })),
        ...pending.values(),
      ];
    },
  };
}
