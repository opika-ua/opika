import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Better Auth's tables, for the kabinet only (H2 handlers slice). Adopters
 * never get a row here: they keep the hand-rolled anonymous session in
 * `sessions` (decision #13).
 *
 * Every table is prefixed `auth_` (HS-Q6, Oleksii; HS-T1 extends it to the
 * organization plugin's three), so `auth_session` can't be mistaken for the
 * adopter `sessions` table in a query, a migration or an incident.
 *
 * The shapes are Better Auth 1.6.33's own (`getSchema` with this app's
 * options), written by hand so every column is reviewed. JS keys are Better
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
     * A shelter admin belongs to exactly one shelter (proposal §2). Unique on
     * the user, not on (org, user), so the database refuses a second
     * membership instead of the actor resolver having to guess between two.
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
 * Who is a super_admin. Its own table rather than a column on `auth_user`,
 * deliberately: Better Auth's user-update endpoints write `auth_user` fields,
 * and a role living there is one misconfigured `additionalFields` away from
 * being self-assignable. Nothing in Better Auth knows this table exists. The
 * only writers are `admin:grant` and `admin:revoke` (HS-Q4), both behind the
 * production guard.
 */
export const superAdmins = pgTable("super_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUser.id, { onDelete: "cascade" }),
  grantedAt: at("granted_at"),
});
