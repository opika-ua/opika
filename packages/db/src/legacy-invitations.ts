/**
 * `invitations:legacy` (§14 Q1): the operator-created shelters whose invitation was never
 * accepted and that have no animals, invited before self-registration (11 on production,
 * 2026-11-18). The owner sends
 * each the registration link himself; this removes their pre-created records and revokes the old
 * invitation links. Selected on exactly that, never on verification status or early listing, so
 * an early listing can't hide one.
 *
 * Usage (from the repo root; `PROD_NEON_ENDPOINT` from the shell or the root `.env.local`):
 *   pnpm --filter @opika/db invitations:legacy                                      dry run, local
 *   pnpm --filter @opika/db invitations:legacy --prod --expect ep-…                 dry run
 *   pnpm --filter @opika/db invitations:legacy --prod --expect ep-… --commit --expect 12
 *
 * `--expect` takes the target's Neon endpoint (`ep-…`, required for any non-local target) and, for
 * `--commit`, the number of shelters to delete: a different count aborts, writing nothing. A
 * support session is kept with its shelter link nulled (0029, decision Q4 (B)), as for applications.
 * No R2 object is touched: these shelters have no animals, and only the clean-up job deletes objects.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ShelterId } from "@opika/domain";
import { and, inArray, or, type SQL, sql } from "drizzle-orm";
import postgres from "postgres";
import { createDatabaseWithClient, type Database } from "./client";
import {
  assertProductionWriteAllowed,
  databaseTargetLine,
  databaseTargetOf,
  expectedTargetOf,
  PROD_FLAG,
} from "./prod-guard";
import {
  eraseUsersAndScrubHistory,
  NOT_ELSEWHERE_IN_USE,
  noLiveInvitationElsewhere,
} from "./repos/admin-erasure-repo";
import { animals } from "./schema/animals";
import {
  authInvitation,
  authMember,
  authOrganization,
  authUser,
  authVerification,
  invitationCreatedUsers,
  supportSessions,
} from "./schema/auth";
import { shelterHistory } from "./schema/shelter-history";
import { shelters } from "./schema/shelters";

/** Operator-created, an invitation still pending, none accepted, no admin and no animal. */
export const LEGACY_INVITED_SHELTER: SQL = sql`(
  ${shelters.registrationSource} = 'operator'
  AND ${shelters.organizationId} IS NOT NULL
  AND EXISTS (SELECT 1 FROM ${authInvitation} WHERE ${authInvitation.organizationId} = ${shelters.organizationId} AND ${authInvitation.status} = 'pending')
  AND NOT EXISTS (SELECT 1 FROM ${authInvitation} WHERE ${authInvitation.organizationId} = ${shelters.organizationId} AND ${authInvitation.status} = 'accepted')
  AND NOT EXISTS (SELECT 1 FROM ${authMember} WHERE ${authMember.organizationId} = ${shelters.organizationId})
  AND NOT EXISTS (SELECT 1 FROM ${animals} WHERE ${animals.shelterId} = ${shelters.id})
)`;

export type LegacyShelter = {
  id: ShelterId;
  name: string;
  organizationId: string;
  /** Every pending invitation's address, for the owner to check against his list. */
  invitedEmails: readonly string[];
  invitationIds: readonly string[];
  hasSupportSession: boolean;
};

export async function legacyInvitedShelters(db: Database): Promise<LegacyShelter[]> {
  const rows = await db
    .select({
      id: shelters.id,
      name: shelters.displayName,
      organizationId: shelters.organizationId,
    })
    .from(shelters)
    .where(LEGACY_INVITED_SHELTER)
    .orderBy(shelters.displayName, shelters.id);
  const organizationIds = rows.flatMap((row) =>
    row.organizationId === null ? [] : [row.organizationId],
  );
  const invitations =
    organizationIds.length === 0
      ? []
      : await db
          .select({
            id: authInvitation.id,
            organizationId: authInvitation.organizationId,
            email: authInvitation.email,
            status: authInvitation.status,
          })
          .from(authInvitation)
          .where(inArray(authInvitation.organizationId, organizationIds));
  const supported =
    rows.length === 0
      ? []
      : await db
          .select({ shelterId: supportSessions.shelterId })
          .from(supportSessions)
          .where(
            inArray(
              supportSessions.shelterId,
              rows.map((row) => row.id),
            ),
          );
  return rows.map((row) => {
    const own = invitations.filter(
      (invitation) => invitation.organizationId === row.organizationId,
    );
    return {
      id: row.id,
      name: row.name,
      organizationId: row.organizationId ?? "",
      invitedEmails: own
        .filter((invitation) => invitation.status === "pending")
        .map((invitation) => invitation.email),
      invitationIds: own.map((invitation) => invitation.id),
      hasSupportSession: supported.some((session) => session.shelterId === row.id),
    };
  });
}

/** «o***@example.org»: enough to recognise an address on the owner's list, no more. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

export type LegacyDeletion =
  | { kind: "deleted"; count: number; inviteesErased: number }
  | { kind: "count_differs"; found: number; expected: number }
  /** One stopped qualifying between the count and the lock: rolled back, nothing written. */
  | { kind: "changed_meanwhile" };

/** Thrown inside the transaction so it rolls back whole; never a partial deletion. */
class LegacySetChanged extends Error {
  override name = "LegacySetChanged";
}

/**
 * Deletes exactly the listed shelters in one transaction, only if all `expected` of them are still
 * legacy when it runs (locked first; otherwise it rolls back and nothing is written). The users
 * their invitations created are erased through `eraseUsersAndScrubHistory` in the same
 * transaction, under its invariant: never a member, an operator or an address with a live
 * invitation elsewhere. Interactive, so a postgres-js connection only, as `demo:remove`.
 */
export async function deleteLegacyShelters(
  db: Database,
  expected: number,
  now: Date,
): Promise<LegacyDeletion> {
  const found = await legacyInvitedShelters(db);
  if (found.length !== expected) {
    return { kind: "count_differs", found: found.length, expected };
  }
  if (found.length === 0) return { kind: "deleted", count: 0, inviteesErased: 0 };
  const ids = found.map((shelter) => shelter.id);
  const organizationIds = found.map((shelter) => shelter.organizationId);
  const targeted = and(inArray(shelters.id, ids), LEGACY_INVITED_SHELTER);
  try {
    return await db.transaction(
      async (tx) => {
        const locked = await tx
          .select({ id: shelters.id })
          .from(shelters)
          .where(targeted)
          .for("update");
        if (locked.length !== ids.length) throw new LegacySetChanged();
        // Read before the organizations go: their invitations' cascade takes these rows with them.
        const invitations = await tx
          .select({ id: authInvitation.id })
          .from(authInvitation)
          .where(inArray(authInvitation.organizationId, organizationIds));
        const invitationIds = invitations.map((row) => row.id);
        const invitees =
          invitationIds.length === 0
            ? []
            : await tx
                .select({ id: invitationCreatedUsers.userId })
                .from(invitationCreatedUsers)
                .where(inArray(invitationCreatedUsers.invitationId, invitationIds));
        if (invitationIds.length > 0) {
          await tx.delete(authVerification).where(
            inArray(
              authVerification.value,
              invitationIds.map((id) => `invitation:${id}`),
            ),
          );
        }
        await tx.delete(shelterHistory).where(inArray(shelterHistory.shelterId, ids));
        const deleted = await tx.delete(shelters).where(targeted).returning({ id: shelters.id });
        // Invitations and their `invitation_created_users` rows cascade with the organization.
        await tx
          .delete(authOrganization)
          .where(
            and(
              inArray(authOrganization.id, organizationIds),
              sql`NOT EXISTS (SELECT 1 FROM ${shelters} WHERE ${shelters.organizationId} = ${authOrganization.id})`,
            ),
          );
        const inviteesErased = await eraseInvitees(
          tx as unknown as Database,
          invitees.map((row) => row.id),
          now,
        );
        return { kind: "deleted" as const, count: deleted.length, inviteesErased };
      },
      { isolationLevel: "read committed" },
    );
  } catch (error) {
    if (error instanceof LegacySetChanged) {
      return { kind: "changed_meanwhile" };
    }
    throw error;
  }
}

/**
 * The invitees' accounts, once their legacy invitations are gone: only those still erasable by
 * the shared invariant (no membership, no operator role, no live invitation anywhere), their
 * Better Auth links first (`auth_verification` has no key to cascade), then the account and the
 * email scrub through the one shared mechanism.
 */
async function eraseInvitees(db: Database, userIds: readonly string[], now: Date): Promise<number> {
  if (userIds.length === 0) return 0;
  const erasable = and(
    inArray(authUser.id, [...userIds]),
    NOT_ELSEWHERE_IN_USE,
    noLiveInvitationElsewhere(now),
  ) as SQL;
  const users = await db
    .select({ id: authUser.id, email: authUser.email })
    .from(authUser)
    .where(erasable)
    .for("update");
  if (users.length === 0) return 0;
  await db.delete(authVerification).where(
    or(
      inArray(
        authVerification.value,
        users.map((user) => user.id),
      ),
      ...users.map(
        (user) =>
          sql`CASE WHEN starts_with(${authVerification.value}, '{"type":"magic-link",') THEN lower(${authVerification.value}::jsonb ->> 'email') END = lower(${user.email})`,
      ),
    ),
  );
  const { erasedCount } = await eraseUsersAndScrubHistory(
    db,
    and(
      inArray(
        authUser.id,
        users.map((user) => user.id),
      ),
      erasable,
    ) as SQL,
  );
  return erasedCount;
}

export type LegacyArgs =
  | { kind: "ok"; commit: boolean; endpoint: string | undefined; count: number | undefined }
  | { kind: "refused"; reason: string };

const TAKES = "it takes --commit, --prod, --expect ep-… and --expect <count>";

export function parseLegacyArgs(argv: readonly string[]): LegacyArgs {
  const args = argv.slice(2);
  let commit = false;
  let endpoint: string | undefined;
  let count: number | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--commit") {
      commit = true;
      continue;
    }
    if (arg === PROD_FLAG) continue;
    if (arg === "--expect") {
      const value = args[i + 1]?.trim();
      i++;
      if (value !== undefined && /^ep-/i.test(value)) {
        if (endpoint !== undefined)
          return { kind: "refused", reason: "--expect ep-… is given twice" };
        endpoint = value;
        continue;
      }
      // Digits only: Number() would read "1e1" or "0x0c".
      if (value !== undefined && /^(0|[1-9]\d*)$/.test(value)) {
        if (count !== undefined)
          return { kind: "refused", reason: "--expect <count> is given twice" };
        count = Number(value);
        continue;
      }
      return { kind: "refused", reason: "--expect needs an endpoint id (ep-…) or a whole number" };
    }
    return { kind: "refused", reason: `argument ${i + 1} is not one this script takes; ${TAKES}` };
  }
  if (commit && count === undefined) {
    return {
      kind: "refused",
      reason: "--commit needs --expect <count>, the number of shelters the dry run listed",
    };
  }
  return { kind: "ok", commit, endpoint, count };
}

/** The dry run's lines: name, id and masked addresses per shelter, then the count. */
export function formatLegacyList(found: readonly LegacyShelter[]): string[] {
  const lines = found.map(
    (shelter) =>
      `  ${shelter.name} | ${shelter.id} | ${shelter.invitedEmails.map(maskEmail).join(", ")}${shelter.hasSupportSession ? " | support session: kept, its shelter link nulled" : ""}`,
  );
  return [
    ...lines,
    `Operator-created shelters with an unaccepted invitation and no animals: ${found.length}`,
  ];
}

const out = (line: string): void => {
  process.stdout.write(`${line}
`);
};
const err = (line: unknown): void => {
  process.stderr.write(`${line instanceof Error ? (line.stack ?? line.message) : String(line)}
`);
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    err("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const args = parseLegacyArgs(process.argv);
  if (args.kind === "refused") {
    err(`REFUSED: ${args.reason}. Nothing was run.`);
    process.exit(1);
  }
  if (databaseTargetOf(url).kind !== "local") {
    const expected = expectedTargetOf(url, args.endpoint);
    if (expected.kind === "refused") {
      err(`REFUSED: ${expected.reason}. Nothing was run.`);
      process.exit(1);
    }
  }
  assertProductionWriteAllowed(url, process.argv, process.env, args.commit ? "write" : "read");
  out(databaseTargetLine(url));
  const client = postgres(url, { max: 1 });
  const db = createDatabaseWithClient(client);
  let exitCode: 0 | 1 = 0;
  try {
    const found = await legacyInvitedShelters(db);
    for (const line of formatLegacyList(found)) out(line);
    if (!args.commit || args.count === undefined) {
      out("DRY RUN: nothing deleted. Re-run with --commit --expect <count> to delete them.");
    } else {
      const result = await deleteLegacyShelters(db, args.count, new Date());
      if (result.kind === "deleted") {
        out(`Deleted: ${result.count} shelters, their organizations, invitations and links.`);
        out(`Invitees' accounts erased: ${result.inviteesErased}.`);
      } else if (result.kind === "changed_meanwhile") {
        err("REFUSED: a shelter changed between the count and the deletion. Nothing was deleted.");
        exitCode = 1;
      } else if (result.kind === "count_differs") {
        err(
          `REFUSED: found ${result.found}, --expect says ${result.expected}. Nothing was deleted.`,
        );
        exitCode = 1;
      }
    }
  } catch (error) {
    err(error);
    err("Nothing was deleted (one transaction).");
    exitCode = 1;
  } finally {
    await client.end();
  }
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
