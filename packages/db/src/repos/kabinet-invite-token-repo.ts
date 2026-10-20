import { createHash } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  authAccount,
  authInvitation,
  authMember,
  authUser,
  authVerification,
  superAdmins,
} from "../schema/auth";
import { shelters } from "../schema/shelters";

/**
 * The invitation's own link secret (PW-2, `docs/shelter-passwords.md` §4.2; Oleksii's §9 answer
 * 1, verbatim excerpt: "(a): separate single-use hashed 72h token; opening the link only shows
 * the form"). The invitation id stops being the link's secret: the email carries a random token,
 * and the database keeps only its hash, one `auth_verification` row per live link.
 *
 * - **`identifier`** is SHA-256 (base64url, no padding) of `invite-password:<token>`: the same
 *   shape Better Auth gives a reset link under the kabinet's `storeIdentifier` override, so the
 *   table holds no token in the clear, whoever wrote the row.
 * - **`value`** is `invitation:<invitation id>`, never a bare id. `authResetLinkRepo` picks a
 *   user's reset links by `value = <user id>`; a prefixed value can never equal one, so voiding
 *   reset links can't delete an invitation's link (and the other way round).
 * - **`expires_at`** is the invitation's own expiry at the moment the link was issued, so the
 *   link never outlives the invitation's 72 hours (`INVITATION_TTL_MS`); the clean-up deletes it
 *   with every other expired verification row (`authExpiryRepo`).
 *
 * Only `kabinetInvitationRepo`'s callers issue (the registry, when an invitation's email goes
 * out). Only `consume` deletes, and only the «Створіть пароль» POST calls it: opening the link
 * reads (`landingOf`) and writes nothing (his PW-2 Q1).
 *
 * Drizzle's query builder only, no raw `.execute()`: the two drivers return different raw shapes
 * (`postgres-js` locally, `neon-http` in production; standing constraint).
 */

const IDENTIFIER_PREFIX = "invite-password:";
const VALUE_PREFIX = "invitation:";

/** What `identifier` holds for a token: SHA-256, base64url, as Better Auth's `defaultKeyHasher`. */
export const inviteTokenIdentifierOf = (token: string): string =>
  createHash("sha256").update(`${IDENTIFIER_PREFIX}${token}`).digest("base64url");

/** What `value` holds for an invitation's link. */
export const inviteTokenValueOf = (invitationId: string): string =>
  `${VALUE_PREFIX}${invitationId}`;

/**
 * Everything the link's page and its POST may need about the invitation a token names, read in
 * one statement. Not a verdict: `invitePasswordStateOf` (apps/web) decides from it, so the rules
 * are a pure function with their own tests.
 */
export type InviteTokenRow = {
  invitationId: string;
  /** `pending`, `accepted`, `canceled`, … as stored. */
  status: string;
  invitationExpiresAt: Date;
  linkExpiresAt: Date;
  email: string;
  shelterName: string;
  /** The user the invitation created (by address), or null if the clean-up removed it. */
  userId: string | null;
  /** An active super_admin grant on that address (never read from the user record, HS-T2). */
  operator: boolean;
  /** A shelter membership already, anywhere. */
  member: boolean;
  /** A credential account holding a hash already. */
  hasPassword: boolean;
};

export function kabinetInviteTokenRepo(db: Database) {
  return {
    /**
     * A new link for an invitation: the invitation's earlier links are deleted in the same
     * statement as the new one's insert, so an invitation has one live link, the newest email's
     * (a resend makes the previous email's link stop working).
     */
    async issue(input: {
      id: string;
      invitationId: string;
      token: string;
      expiresAt: Date;
      now: Date;
    }): Promise<void> {
      const value = inviteTokenValueOf(input.invitationId);
      const earlier = db
        .$with("earlier")
        .as(
          db
            .delete(authVerification)
            .where(eq(authVerification.value, value))
            .returning({ id: authVerification.id }),
        );
      await db
        .with(earlier)
        .insert(authVerification)
        .values({
          id: input.id,
          identifier: inviteTokenIdentifierOf(input.token),
          value,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          updatedAt: input.now,
        });
    },

    /** The invitation a token names, or null for a token with no row. A read only. */
    async landingOf(token: string): Promise<InviteTokenRow | null> {
      const [row] = await db
        .select({
          invitationId: authInvitation.id,
          status: authInvitation.status,
          invitationExpiresAt: authInvitation.expiresAt,
          linkExpiresAt: authVerification.expiresAt,
          email: authInvitation.email,
          shelterName: shelters.displayName,
          userId: authUser.id,
          operator: sql<boolean>`EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${authUser.id} AND ${superAdmins.revokedAt} IS NULL)`,
          member: sql<boolean>`EXISTS (SELECT 1 FROM ${authMember} WHERE ${authMember.userId} = ${authUser.id})`,
          hasPassword: sql<boolean>`EXISTS (SELECT 1 FROM ${authAccount} WHERE ${authAccount.userId} = ${authUser.id} AND ${authAccount.providerId} = 'credential' AND ${authAccount.password} IS NOT NULL)`,
        })
        .from(authVerification)
        .innerJoin(
          authInvitation,
          eq(authVerification.value, sql`${VALUE_PREFIX} || ${authInvitation.id}`),
        )
        .innerJoin(shelters, eq(shelters.organizationId, authInvitation.organizationId))
        .leftJoin(authUser, eq(authUser.email, authInvitation.email))
        .where(eq(authVerification.identifier, inviteTokenIdentifierOf(token)))
        .limit(1);
      if (row === undefined) return null;
      // EXISTS over a missing user (the left join found none) is false, never null.
      return {
        ...row,
        operator: row.operator === true,
        member: row.member === true,
        hasPassword: row.hasPassword === true,
      };
    },

    /**
     * Uses the link up: deletes its row if it is still unexpired, in one statement. True for
     * exactly one caller per link, however many submit it at once; false once it is used,
     * expired or never existed.
     */
    async consume(token: string, now: Date): Promise<boolean> {
      const deleted = await db
        .delete(authVerification)
        .where(
          and(
            eq(authVerification.identifier, inviteTokenIdentifierOf(token)),
            sql`${authVerification.value} LIKE ${`${VALUE_PREFIX}%`}`,
            gt(authVerification.expiresAt, now),
          ),
        )
        .returning({ id: authVerification.id });
      return deleted.length === 1;
    },
  };
}
