import { sql } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { shelters } from "./shelters";

/**
 * Better Auth's tables, for the kabinet only (H2 handlers slice). Adopters
 * never get a row here: they keep the hand-rolled anonymous session in
 * `sessions` (decision #13).
 *
 * Every table is prefixed `auth_` (HS-Q6, Oleksii; HS-T1 extends it to the
 * organization plugin's three), so `auth_session` can't be mistaken for the
 * adopter `sessions` table in a query, a migration or an incident.
 *
 * The shapes are Better Auth 1.7.14's own (`getSchema` with this app's
 * options, unchanged from 1.6.33), written by hand so every column is reviewed. JS keys are Better
 * Auth's field names, which its Drizzle adapter looks up; SQL names are this
 * repo's snake_case. Ids are text holding UUIDs (`generateId: "uuid"`), so
 * they parse as `ModeratorId`/`ShelterAdminId` (proposal §2).
 */

const at = (name: string) => timestamp(name, { withTimezone: true }).notNull();

export const authUser = pgTable("auth_user", {
  id: text().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: at("created_at"),
  updatedAt: at("updated_at"),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text().primaryKey(),
    expiresAt: at("expires_at"),
    token: text("token").notNull().unique(),
    createdAt: at("created_at"),
    updatedAt: at("updated_at"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    /** The organization plugin writes it; actor resolution ignores it (one membership per user). */
    activeOrganizationId: text("active_organization_id"),
  },
  (t) => [index("auth_session_user_id_idx").on(t.userId)],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: at("created_at"),
    updatedAt: at("updated_at"),
  },
  (t) => [index("auth_account_user_id_idx").on(t.userId)],
);

export const authVerification = pgTable(
  "auth_verification",
  {
    id: text().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: at("expires_at"),
    createdAt: at("created_at"),
    updatedAt: at("updated_at"),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);

/** One per shelter, linked by `shelters.organization_id`. */
export const authOrganization = pgTable("auth_organization", {
  id: text().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: at("created_at"),
  metadata: text("metadata"),
});

export const authMember = pgTable(
  "auth_member",
  {
    id: text().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => authOrganization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: at("created_at"),
  },
  (t) => [
    index("auth_member_organization_id_idx").on(t.organizationId),
    /**
     * A shelter admin belongs to exactly one shelter (proposal §2, HS-Q7).
     * Unique on the user, not on (org, user), so the database refuses a second
     * membership instead of the actor resolver having to guess between two.
     *
     * Known limitation, accepted (HS-Q7, Oleksii): one person can't administer
     * two shelters. Relaxing it is a migration (drop this index) plus an
     * actor that can carry more than one shelter, not a code change alone.
     * It also means the operator is never a member of a shelter's
     * organization, so invitations are written server-side by
     * `kabinetInvitationRepo` (the only writer of `auth_invitation`), not
     * through the organization plugin's invite endpoint.
     */
    uniqueIndex("auth_member_user_id_unique").on(t.userId),
  ],
);

export const authInvitation = pgTable(
  "auth_invitation",
  {
    id: text().primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => authOrganization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull(),
    expiresAt: at("expires_at"),
    createdAt: at("created_at"),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("auth_invitation_organization_id_idx").on(t.organizationId),
    index("auth_invitation_email_idx").on(t.email),
  ],
);

/**
 * Who is a super_admin. Its own table rather than a column on `auth_user`
 * (HS-T2, Oleksii): Better Auth's user-update endpoints write `auth_user`
 * fields, and a role living there is one misconfigured `additionalFields`
 * away from being self-assignable. Authorisation reads this table only, never
 * an `auth_user` field, and Better Auth's `admin` plugin (which keeps its own
 * `role` on the user) stays disabled, with a test that fails if it's enabled.
 *
 * One row per grant, never deleted (HS-T2): `admin:revoke` sets `revoked_at`,
 * so who held the role, and when, survives the revocation. A grant is active
 * while `revoked_at` is null, and a user has at most one active grant at a
 * time (the partial unique index), so a re-grant after a revoke is a new row.
 * The only production writers are `admin:grant` and `admin:revoke` (HS-Q4; tests and the auth
 * smoke write fixture grants on throwaway databases), both behind
 * the production guard.
 *
 * **One named exception** (Oleksii, 2026-10-25, confirming PR #199's Tier 1
 * review): `db:full-reset` (`full-reset.ts`) overrides this rule by design.
 * A full reset's whole purpose is the moment before any real shelter exists
 * - there is no real operator history yet to audit, so wiping this table
 * along with everything else loses nothing a pre-launch reset is meant to
 * protect. The rule above still holds for every other write path.
 */
export const superAdmins = pgTable(
  "super_admins",
  {
    id: text().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id),
    grantedAt: at("granted_at"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("super_admins_active_user_unique").on(t.userId).where(sql`${t.revokedAt} IS NULL`),
  ],
);

/**
 * An operator viewing one shelter's kabinet read-only (KABINET S5, RG-Q4,
 * RS-Q0). Exactly the columns Oleksii approved: who, which shelter, when it
 * started, when last used, when and why it ended. **No IP, no user-agent.**
 * `token_hash` is the cookie's lookup key, stored as a hash and never the
 * token, as decision #13 does for adopters (Oleksii: "Hashed token in
 * support_sessions: fine"). Rows are never deleted: who viewed which shelter,
 * and when, stays auditable.
 *
 * **One named exception** (Oleksii, 2026-10-25, confirming PR #199's Tier 1
 * review): `db:full-reset` (`full-reset.ts`) overrides this rule by design,
 * for the same reason `super_admins` above does - nothing real to audit
 * before launch. The rule above still holds for every other write path.
 */
export const supportSessions = pgTable(
  "support_sessions",
  {
    id: text().primaryKey(),
    operatorUserId: text("operator_user_id")
      .notNull()
      .references(() => authUser.id),
    shelterId: text("shelter_id")
      .notNull()
      .references(() => shelters.id),
    tokenHash: text("token_hash").notNull().unique(),
    startedAt: at("started_at"),
    lastSeenAt: at("last_seen_at"),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /**
     * Why it ended: the operator left (`exited`), it sat idle past 30 minutes
     * (`idle`), or the operator entered another shelter (`replaced`).
     */
    endReason: text("end_reason", { enum: ["exited", "idle", "replaced"] }),
  },
  (t) => [index("support_sessions_operator_idx").on(t.operatorUserId)],
);

/**
 * A user that an invitation created (RG-Q3): written by `kabinetInvitationRepo`
 * in the same write as the invitation, so the clean-up knows which users are
 * its own. `first_session_at` is set by a Better Auth hook the first time the
 * user signs in. That keeps "no sessions ever" a fact this table holds, not
 * something inferred from `auth_session`, whose rows vanish on sign-out and
 * expiry (RS-Q0).
 */
export const invitationCreatedUsers = pgTable("invitation_created_users", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUser.id, { onDelete: "cascade" }),
  invitationId: text("invitation_id")
    .notNull()
    .references(() => authInvitation.id, { onDelete: "cascade" }),
  createdAt: at("created_at"),
  firstSessionAt: timestamp("first_session_at", { withTimezone: true }),
});
