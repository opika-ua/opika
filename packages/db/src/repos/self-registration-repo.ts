import type { Shelter, ShelterHistoryEntry, ShelterId, VerificationStatus } from "@opika/domain";
import { and, eq, gt, isNull, ne, or, sql } from "drizzle-orm";
import { type Database, inOneTransaction } from "../client";
import {
  authAccount,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
} from "../schema/auth";
import { cities } from "../schema/cities";
import { registrationEmailTokens } from "../schema/registration-email-tokens";
import { shelterHistory } from "../schema/shelter-history";
import { shelters } from "../schema/shelters";
import { MAGIC_LINK_VALUE_PREFIX } from "./application-deletion-repo";
import { HASHED_IDENTIFIER } from "./auth-reset-link-repo";
import { historyRowSelect } from "./history-sql";
import { CREDENTIAL_PROVIDER_ID } from "./kabinet-actor-repo";
import { rowToShelter, shelterToRow } from "./mappers";

export type RegistrationTokenPurpose = "confirm_email" | "not_me";

/** A confirmation email's link, as stored: the SHA-256 of the token, never the token. */
export type RegistrationTokenRow = {
  tokenHash: string;
  purpose: RegistrationTokenPurpose;
  expiresAt: Date;
};

/** Every confirmation email carries both links. */
export type RegistrationTokenPair = readonly [RegistrationTokenRow, RegistrationTokenRow];

export type SelfRegistrationWrite = {
  userId: string;
  /** Trimmed and lowercased, as sign-in keys it. */
  email: string;
  accountId: string;
  /** Better Auth's own hash of the password (`context.password.hash`). */
  passwordHash: string;
  organizationId: string;
  memberId: string;
  /** In `application`; the CHECKs tie it to `registration_source` and `applied_at`. */
  shelter: Shelter;
  history: { id: string; entry: ShelterHistoryEntry };
  tokens: RegistrationTokenPair;
  now: Date;
};

export type SelfRegistrationOutcome = { kind: "registered" } | { kind: "email_taken" };

/** The registrant's application, as the confirmation links and the resend need it. */
export type RegistrantApplication = {
  userId: string;
  email: string;
  emailVerified: boolean;
  shelterId: ShelterId;
  displayName: string;
  status: VerificationStatus;
};

/** What the operator's new-application email shows (D6): the queue card, in the inbox. */
export type ApplicationSummary = {
  shelterId: ShelterId;
  displayName: string;
  cityName: string;
  link: string | null;
  /** Null when the registrant left the contact field empty. */
  contact: NonNullable<Shelter["contact"]>["primary"] | null;
  email: string;
};

export type EmailConfirmOutcome =
  | { kind: "confirmed"; userId: string; application: ApplicationSummary | null }
  | { kind: "unusable" };

/** An unconfirmed registrant's new login address, as `changeLoginEmail` writes it (owner, 2026-11-25). */
export type LoginEmailChangeWrite = {
  userId: string;
  /** The address read before the change: a compare-and-set, so a change in between wins. */
  from: string;
  /** Trimmed and lowercased, as sign-in keys it. */
  to: string;
  /**
   * The credential hash the password was verified against, compared again in the write so a
   * password change racing the verify refuses it. Null on the operator path (no password).
   */
  passwordHash: string | null;
  /** The session that asked stays signed in; null ends every session of the user. */
  keepSessionId: string | null;
  history: { id: string; entry: Extract<ShelterHistoryEntry, { kind: "login_email_changed" }> };
  /** The new address's links, written in the same transaction: it never stands without one. */
  tokens: RegistrationTokenPair;
  now: Date;
};

export type LoginEmailChangeOutcome =
  | { kind: "changed" }
  | { kind: "email_taken" }
  /** Verified, decided or changed meanwhile: nothing to change any more. */
  | { kind: "not_needed" }
  /** The password changed between the verify and the write. */
  | { kind: "wrong_password" };

const EMAIL_INDEX = "auth_user_email_unique";

/** Postgres refused the address on `auth_user`'s unique email; postgres-js and neon-http name it differently. */
const emailTaken = (error: unknown): boolean => {
  type PgError = { code?: string; constraint?: string; constraint_name?: string };
  const outer = error as PgError & { cause?: PgError };
  const pg = outer.cause?.code !== undefined ? outer.cause : outer;
  return pg.code === "23505" && (pg.constraint_name ?? pg.constraint) === EMAIL_INDEX;
};

const usable = (purpose: RegistrationTokenPurpose, tokenHash: string, now: Date) =>
  and(
    eq(registrationEmailTokens.tokenHash, tokenHash),
    eq(registrationEmailTokens.purpose, purpose),
    isNull(registrationEmailTokens.usedAt),
    gt(registrationEmailTokens.expiresAt, now),
  );

/**
 * Self-registration's writes (2026-11-18): the second and last module allowed to write
 * `auth_member` (`no-self-serve-yet.test.ts`), creating the registrant's membership of the shelter
 * it registers, and the confirmation email's links.
 */
export function selfRegistrationRepo(db: Database) {
  const repo = {
    /**
     * The account, its password, the organization, the membership, the shelter in `application`
     * with its `shelter_registered` line, and both email links: one transaction, so a failed
     * statement leaves none of it. A taken address is a value, never the unique index's error.
     */
    async register(input: SelfRegistrationWrite): Promise<SelfRegistrationOutcome> {
      if (input.shelter.verification.status !== "application") {
        throw new Error("A self-registered shelter starts as an application");
      }
      const [existing] = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, input.email))
        .limit(1);
      if (existing !== undefined) return { kind: "email_taken" };

      const shelterRow = {
        ...shelterToRow(input.shelter),
        organizationId: input.organizationId,
        registrantUserId: input.userId,
      };
      try {
        await inOneTransaction(db, (tx) => {
          const created = tx
            .$with("created")
            .as(tx.insert(shelters).values(shelterRow).returning({ id: shelters.id }));
          return [
            tx.insert(authUser).values({
              id: input.userId,
              // Better Auth requires a name; the person gave only the shelter's.
              name: input.shelter.displayName,
              email: input.email,
              emailVerified: false,
              createdAt: input.now,
              updatedAt: input.now,
            }),
            tx.insert(authAccount).values({
              id: input.accountId,
              accountId: input.userId,
              providerId: "credential",
              userId: input.userId,
              password: input.passwordHash,
              createdAt: input.now,
              updatedAt: input.now,
            }),
            tx.insert(authOrganization).values({
              id: input.organizationId,
              // As the operator's path does: the shelter's id is the name and the unique slug.
              name: input.shelter.id,
              slug: input.shelter.id,
              createdAt: input.now,
            }),
            tx
              .with(created)
              .insert(shelterHistory)
              .select(
                sql`SELECT ${historyRowSelect(input.history, sql`"created"."id"`)} FROM "created"`,
              ),
            tx.insert(authMember).values({
              id: input.memberId,
              organizationId: input.organizationId,
              userId: input.userId,
              role: "admin",
              createdAt: input.now,
            }),
            tx
              .insert(registrationEmailTokens)
              .values(input.tokens.map((token) => ({ ...token, userId: input.userId }))),
          ] as const;
        });
      } catch (error) {
        // Two registrations of one address at once: the loser reads as taken.
        if (emailTaken(error)) return { kind: "email_taken" };
        throw error;
      }
      return { kind: "registered" };
    },

    /**
     * The login address, its unused links, reset links, old-address magic links and every other
     * session, in one transaction (proposal §4). The history line is the marker: each later
     * statement acts only if it was written, so a refused change touches nothing.
     */
    async changeLoginEmail(input: LoginEmailChangeWrite): Promise<LoginEmailChangeOutcome> {
      const { userId, from, to, now } = input;
      const marked = sql`EXISTS (SELECT 1 FROM ${shelterHistory} WHERE ${shelterHistory.id} = ${input.history.id})`;
      // Compare-and-set on the hash the password was verified against.
      const passwordUnchanged =
        input.passwordHash === null
          ? sql`true`
          : sql`EXISTS (SELECT 1 FROM ${authAccount} WHERE ${authAccount.userId} = ${userId} AND ${authAccount.providerId} = ${CREDENTIAL_PROVIDER_ID} AND ${authAccount.password} = ${input.passwordHash})`;
      const tokenRows = input.tokens.map(
        (token) =>
          sql`(${token.tokenHash}, ${token.purpose}, ${token.expiresAt.toISOString()}::timestamptz)`,
      );
      const otherSessions =
        input.keepSessionId === null
          ? eq(authSession.userId, userId)
          : and(eq(authSession.userId, userId), ne(authSession.id, input.keepSessionId));
      // Better Auth's magic link keeps the address in a JSON value, never the user id.
      const oldAddressMagicLink = sql`CASE WHEN starts_with(${authVerification.value}, ${MAGIC_LINK_VALUE_PREFIX}) THEN lower(${authVerification.value}::jsonb ->> 'email') END = lower(${from})`;
      let marker: readonly unknown[];
      try {
        [marker] = await inOneTransaction(db, (tx) => {
          const changed = tx.$with("changed").as(
            tx
              .update(authUser)
              .set({ email: to, updatedAt: now })
              .where(
                and(
                  eq(authUser.id, userId),
                  eq(authUser.email, from),
                  eq(authUser.emailVerified, false),
                  sql`EXISTS (SELECT 1 FROM ${shelters} WHERE ${shelters.registrantUserId} = ${userId} AND ${shelters.registrationSource} = 'self_registration' AND ${shelters.verificationStatus} = 'application')`,
                  passwordUnchanged,
                ),
              )
              .returning({ id: authUser.id }),
          );
          return [
            tx
              .with(changed)
              .insert(shelterHistory)
              .select(
                sql`SELECT ${historyRowSelect(input.history, sql`"s"."id"`)} FROM "changed" JOIN ${shelters} AS "s" ON "s"."registrant_user_id" = "changed"."id"`,
              )
              .returning({ id: shelterHistory.id }),
            // Both purposes (D2): the old address's «Це не я» goes too.
            tx
              .delete(registrationEmailTokens)
              .where(
                and(
                  eq(registrationEmailTokens.userId, userId),
                  isNull(registrationEmailTokens.usedAt),
                  marked,
                ),
              ),
            tx
              .insert(registrationEmailTokens)
              .select(
                sql`SELECT "v"."token_hash", ${userId}, "v"."purpose", "v"."expires_at", NULL FROM (VALUES ${sql.join(tokenRows, sql`, `)}) AS "v"("token_hash", "purpose", "expires_at") WHERE ${marked}`,
              ),
            tx.delete(authSession).where(and(otherSessions, marked)),
            // D3: a reset link sent to the old mailbox would otherwise still set a password.
            tx
              .delete(authVerification)
              .where(
                and(
                  marked,
                  or(
                    and(
                      eq(authVerification.value, userId),
                      sql`${authVerification.identifier} ~ ${HASHED_IDENTIFIER}`,
                    ),
                    oldAddressMagicLink,
                  ),
                ),
              ),
          ] as const;
        });
      } catch (error) {
        // The address taken between the app's check and this write: as registration answers.
        if (emailTaken(error)) return { kind: "email_taken" };
        throw error;
      }
      if (marker.length === 1) return { kind: "changed" };

      // Nothing written: tell why from what stands now.
      const application = await repo.applicationOf(userId);
      if (
        application === null ||
        application.emailVerified ||
        application.status !== "application" ||
        application.email !== from
      ) {
        return { kind: "not_needed" };
      }
      if (
        input.passwordHash !== null &&
        (await repo.credentialHashOf(userId)) !== input.passwordHash
      ) {
        return { kind: "wrong_password" };
      }
      return { kind: "not_needed" };
    },

    /** The user's password hash (Better Auth's credential account), or null without one. */
    async credentialHashOf(userId: string): Promise<string | null> {
      const [row] = await db
        .select({ password: authAccount.password })
        .from(authAccount)
        .where(
          and(eq(authAccount.userId, userId), eq(authAccount.providerId, CREDENTIAL_PROVIDER_ID)),
        )
        .limit(1);
      return row?.password ?? null;
    },

    /** Whether the address (trimmed, lowercased) already has an account. A read only. */
    async hasAccount(email: string): Promise<boolean> {
      const [row] = await db
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.email, email))
        .limit(1);
      return row !== undefined;
    },

    /**
     * «Це не я» after approval (owner, 2026-11-18): the link is used up and an operator-only line
     * written in one statement, so a second click records nothing more. True when it recorded.
     */
    async recordNotMeAfterApproval(tokenHash: string, historyId: string, now: Date) {
      const used = db.$with("used").as(
        db
          .update(registrationEmailTokens)
          .set({ usedAt: now })
          .where(usable("not_me", tokenHash, now))
          .returning({ userId: registrationEmailTokens.userId }),
      );
      const entry: ShelterHistoryEntry = { kind: "not_me_after_approval", at: now };
      const rows = await db
        .with(used)
        .insert(shelterHistory)
        .select(
          sql`SELECT ${historyRowSelect({ id: historyId, entry }, sql`"s"."id"`)} FROM "used" JOIN ${shelters} AS "s" ON "s"."registrant_user_id" = "used"."user_id"`,
        )
        .returning({ id: shelterHistory.id });
      return rows.length === 1;
    },

    /** A resend's two new links; the earlier ones stay good until they expire. */
    async issueTokens(userId: string, tokens: RegistrationTokenPair): Promise<void> {
      await db
        .insert(registrationEmailTokens)
        .values(tokens.map((token) => ({ ...token, userId })));
    },

    /** Whose link this is, if it can still act. A read only: what a link's GET may do. */
    async tokenUser(
      purpose: RegistrationTokenPurpose,
      tokenHash: string,
      now: Date,
    ): Promise<string | null> {
      const [row] = await db
        .select({ userId: registrationEmailTokens.userId })
        .from(registrationEmailTokens)
        .where(usable(purpose, tokenHash, now))
        .limit(1);
      return row?.userId ?? null;
    },

    /** Uses a link up; true for exactly one caller. */
    async useToken(purpose: RegistrationTokenPurpose, tokenHash: string, now: Date) {
      const rows = await db
        .update(registrationEmailTokens)
        .set({ usedAt: now })
        .where(usable(purpose, tokenHash, now))
        .returning({ userId: registrationEmailTokens.userId });
      return rows.length === 1;
    },

    /**
     * «Підтвердити email»: the link is used up and the address marked verified in one statement,
     * so of two clicks at once exactly one confirms.
     */
    async confirmEmail(tokenHash: string, now: Date): Promise<EmailConfirmOutcome> {
      const used = db.$with("used").as(
        db
          .update(registrationEmailTokens)
          .set({ usedAt: now })
          .where(usable("confirm_email", tokenHash, now))
          .returning({ userId: registrationEmailTokens.userId }),
      );
      const [confirmed] = await db
        .with(used)
        .update(authUser)
        .set({ emailVerified: true, updatedAt: now })
        .where(sql`${authUser.id} IN (SELECT "user_id" FROM "used")`)
        .returning({ id: authUser.id });
      if (confirmed === undefined) return { kind: "unusable" };
      return {
        kind: "confirmed",
        userId: confirmed.id,
        application: await repo.summaryOf(confirmed.id),
      };
    },

    /** The shelter `userId` registered, or null (operator-created shelters have no registrant). */
    async applicationOf(userId: string): Promise<RegistrantApplication | null> {
      const [row] = await db
        .select({
          userId: authUser.id,
          email: authUser.email,
          emailVerified: authUser.emailVerified,
          shelterId: shelters.id,
          displayName: shelters.displayName,
          status: shelters.verificationStatus,
        })
        .from(shelters)
        .innerJoin(authUser, eq(authUser.id, shelters.registrantUserId))
        .where(eq(shelters.registrantUserId, userId))
        .limit(1);
      return row ?? null;
    },

    async summaryOf(userId: string): Promise<ApplicationSummary | null> {
      const [row] = await db
        .select({ shelter: shelters, cityName: cities.nameUk, email: authUser.email })
        .from(shelters)
        .innerJoin(authUser, eq(authUser.id, shelters.registrantUserId))
        .innerJoin(cities, eq(cities.id, shelters.cityId))
        .where(eq(shelters.registrantUserId, userId))
        .limit(1);
      if (row === undefined) return null;
      const shelter = rowToShelter(row.shelter);
      const link = shelter.verification.evidence.items.find((item) => item.kind === "public_link");
      return {
        shelterId: shelter.id,
        displayName: shelter.displayName,
        cityName: row.cityName,
        link: link?.kind === "public_link" ? link.url : null,
        contact: shelter.contact?.primary ?? null,
        email: row.email,
      };
    },
  };
  return repo;
}
