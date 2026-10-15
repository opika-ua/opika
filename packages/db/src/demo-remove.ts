/**
 * `demo:remove`: deletes the seeded demo corpus from a database that already
 * holds a real shelter (RG-Q11: "the demo corpus is removed at the first real
 * shelter"). `db:seed` can't do this: it only truncates every table and
 * reseeds, which would take a real shelter with it.
 *
 * What it deletes is Oleksii's Phase 0 answer (inbox DR-B1, 2026-10-15),
 * narrowed by his DR-Q1 (b) to leave support sessions alone: the
 * shelters in the seed's reserved id range and everything attached to them
 * (their animals, swipes and reveals on those animals, shelter history, each
 * shelter's organization with its invitations; a member is a refusal), plus
 * users whose only link was an invitation to one of those shelters and who are
 * not super_admin (step 4's `+test` user). Cities stay:
 * a real shelter needs one. Demo photos are repo files, not R2 objects.
 *
 * Usage (from the repo root; `PROD_NEON_ENDPOINT` from the shell or the root
 * `.env.local`, as for every production-aware script):
 *   pnpm --filter @opika/db demo:remove --expect ep-…                 dry run
 *   pnpm --filter @opika/db demo:remove --expect ep-… --commit        deletes
 *   … --prod                                                           when the target is production
 *
 * Refuses (exit 1, nothing deleted) when:
 *   - the target's Neon compute isn't exactly `--expect` (smoke scripts' rule);
 *   - no shelter outside the seed range exists: the site must never end up
 *     empty (DR-B1, guard 3a);
 *   - a demo shelter still has a member: removing someone's access is
 *     `registry/admins/remove`'s job, recorded in that shelter's history;
 *   - a demo shelter has a support session: RS-Q0 keeps those rows forever
 *     ("Rows never deleted"), and their foreign key doesn't cascade, so such a
 *     shelter can't go. Oleksii, DR-Q1 (b): "Never delete support sessions;
 *     demo:remove refuses while any demo shelter has one. If the count on
 *     production isn't 0 when I run it, I decide again with the number in
 *     front of me.";
 *   - a shelter outside the seed range sits on the seed's test-only location
 *     key (RG-Q11's privacy bug, the same rule as `location:verify`);
 *   - a reveal links a demo animal to a non-demo shelter or the reverse, which
 *     no code path writes, so deleting it would touch a row outside the corpus;
 *   - NODE_ENV=production (recognising the test-only key needs the seed's policy).
 *
 * The deletion is one transaction, so it lands whole or not at all. It plans
 * again inside the transaction and rolls back if any table's deleted count
 * differs from that plan. A second dry run afterwards reports all zeros.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type LocationPrivacyPolicy, testOnlyLocationPolicy } from "@opika/domain";
import { count, inArray, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { createDatabaseWithClient, type Database } from "./client";
import { assertProductionWriteAllowed, databaseTargetLine, databaseTargetOf } from "./prod-guard";
import { animals } from "./schema/animals";
import {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  invitationCreatedUsers,
  superAdmins,
  supportSessions,
} from "./schema/auth";
import { reveals } from "./schema/reveals";
import { shelterHistory } from "./schema/shelter-history";
import { shelters } from "./schema/shelters";
import { swipes } from "./schema/swipes";
import { SEED_LOCATION_POLICY_KEY, SEED_SHELTER_ID_PREFIX } from "./seed-ids";
import { storedWith } from "./verify-locations";

/** Every table the removal deletes from, in the order it deletes. */
export const DEMO_REMOVAL_TABLES = [
  "swipes",
  "reveals",
  "animals",
  "shelter_history",
  "shelters",
  "auth_invitation",
  "auth_organization",
  "auth_user",
] as const;
export type DemoRemovalTable = (typeof DEMO_REMOVAL_TABLES)[number];
export type DemoRemovalCounts = Record<DemoRemovalTable, number>;

export type DemoRemovalRefusal =
  | { kind: "no_real_shelter" }
  | { kind: "demo_shelter_has_members"; members: number }
  | { kind: "demo_shelter_has_support_sessions"; sessions: number }
  | { kind: "test_key_on_real_shelter"; shelters: number }
  | { kind: "reveal_crosses_the_corpus"; reveals: number };

/**
 * Rows that go by foreign-key cascade rather than by a delete of their own,
 * shown so the dry run hides nothing (review of the pre-commit diff, finding
 * 4): `invitation_created_users` rows of the demo invitations (including
 * those of users who stay, such as one who has since joined a real shelter),
 * and the sessions and accounts of the users deleted.
 */
export type DemoRemovalCascades = {
  invitation_created_users: number;
  auth_session: number;
  auth_account: number;
};

export type DemoRemovalPlan = {
  demoShelters: readonly { id: string; displayName: string }[];
  /** Shelters outside the seed range: counted, never named, never touched. */
  otherShelters: number;
  counts: DemoRemovalCounts;
  cascades: DemoRemovalCascades;
  /** Members of a demo shelter's organization: any at all is a refusal, so none is ever deleted. */
  demoMembers: number;
  /** Support sessions on a demo shelter: any at all is a refusal (RS-Q0, DR-Q1), so none is ever deleted. */
  demoSupportSessions: number;
  refusals: readonly DemoRemovalRefusal[];
};

export type DemoRemovalResult =
  | { kind: "refused"; plan: DemoRemovalPlan }
  | { kind: "nothing_to_remove"; plan: DemoRemovalPlan }
  | { kind: "removed"; plan: DemoRemovalPlan; deleted: DemoRemovalCounts };

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

/** `-` is no LIKE wildcard, so this is exactly `isSeedShelterId`'s prefix test. */
const DEMO_ID_PATTERN = `${SEED_SHELTER_ID_PREFIX}-%`;

const demoAnimalIds = sql`(SELECT ${animals.id} FROM ${animals} WHERE ${animals.shelterId} LIKE ${DEMO_ID_PATTERN})`;
const demoOrganizationIds = sql`(SELECT ${shelters.organizationId} FROM ${shelters} WHERE ${shelters.id} LIKE ${DEMO_ID_PATTERN} AND ${shelters.organizationId} IS NOT NULL)`;

/**
 * Users whose only link was an invitation to a demo shelter (DR-B1, answer 2).
 * `invitation_created_users` holds one row per user, the invitation that
 * created them, so "only" means none of the other links a user can have: no
 * super_admin row (active or revoked), no membership anywhere, no support
 * session as operator, no invitation sent, and no invitation for their address
 * to any other shelter, in any status: a user re-invited to a real shelter
 * must stay, or that invitation could never be accepted (sign-up is off; the
 * invited-users sweep keeps the same case, `kabinet-invited-users-repo.ts`).
 */
const demoOnlyUserIds = sql`(
  SELECT ${invitationCreatedUsers.userId} FROM ${invitationCreatedUsers}
  JOIN ${authInvitation} ON ${authInvitation.id} = ${invitationCreatedUsers.invitationId}
  JOIN ${authUser} ON ${authUser.id} = ${invitationCreatedUsers.userId}
  WHERE ${authInvitation.organizationId} IN ${demoOrganizationIds}
    AND NOT EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${invitationCreatedUsers.userId})
    AND NOT EXISTS (SELECT 1 FROM ${authMember} WHERE ${authMember.userId} = ${invitationCreatedUsers.userId})
    AND NOT EXISTS (SELECT 1 FROM ${supportSessions} WHERE ${supportSessions.operatorUserId} = ${invitationCreatedUsers.userId})
    AND NOT EXISTS (SELECT 1 FROM "auth_invitation" AS sent WHERE sent.inviter_id = ${invitationCreatedUsers.userId})
    AND NOT EXISTS (
      SELECT 1 FROM "auth_invitation" AS elsewhere
      WHERE elsewhere.email = ${authUser.email}
        AND elsewhere.organization_id NOT IN ${demoOrganizationIds}
    )
)`;

const isDemoAnimal = sql`${reveals.animalId} IN ${demoAnimalIds}`;
const isDemoShelterReveal = sql`${reveals.shelterId} LIKE ${DEMO_ID_PATTERN}`;

/** What each table's deletion targets; the plan counts exactly these rows. */
const TARGETS: Record<DemoRemovalTable, { table: PgTable; where: SQL }> = {
  swipes: { table: swipes, where: sql`${swipes.animalId} IN ${demoAnimalIds}` },
  reveals: { table: reveals, where: sql`(${isDemoAnimal} OR ${isDemoShelterReveal})` },
  animals: { table: animals, where: sql`${animals.shelterId} LIKE ${DEMO_ID_PATTERN}` },
  shelter_history: {
    table: shelterHistory,
    where: sql`${shelterHistory.shelterId} LIKE ${DEMO_ID_PATTERN}`,
  },
  shelters: { table: shelters, where: sql`${shelters.id} LIKE ${DEMO_ID_PATTERN}` },
  auth_invitation: {
    table: authInvitation,
    where: sql`${authInvitation.organizationId} IN ${demoOrganizationIds}`,
  },
  auth_organization: {
    table: authOrganization,
    where: sql`${authOrganization.id} IN ${demoOrganizationIds}`,
  },
  auth_user: { table: authUser, where: sql`${authUser.id} IN ${demoOnlyUserIds}` },
};

const countWhere = async (db: Executor, table: DemoRemovalTable): Promise<number> => {
  const target = TARGETS[table];
  const [row] = await db.select({ n: count() }).from(target.table).where(target.where);
  return row?.n ?? 0;
};

export async function planDemoRemoval(
  db: Executor,
  testPolicy: LocationPrivacyPolicy,
): Promise<DemoRemovalPlan> {
  const demoShelters = await db
    .select({ id: shelters.id, displayName: shelters.displayName })
    .from(shelters)
    .where(sql`${shelters.id} LIKE ${DEMO_ID_PATTERN}`)
    .orderBy(shelters.id);
  const others = await db
    .select({
      id: shelters.id,
      exactAddress: shelters.exactAddress,
      publicLocation: shelters.publicLocation,
    })
    .from(shelters)
    .where(sql`${shelters.id} NOT LIKE ${DEMO_ID_PATTERN}`);

  const counts = {} as DemoRemovalCounts;
  for (const table of DEMO_REMOVAL_TABLES) counts[table] = await countWhere(db, table);
  const countOf = async (table: PgTable, where: SQL) =>
    (await db.select({ n: count() }).from(table).where(where))[0]?.n ?? 0;
  const demoSupportSessions = await countOf(
    supportSessions,
    sql`${supportSessions.shelterId} LIKE ${DEMO_ID_PATTERN}`,
  );
  const demoMembers = await countOf(
    authMember,
    sql`${authMember.organizationId} IN ${demoOrganizationIds}`,
  );
  const cascades: DemoRemovalCascades = {
    invitation_created_users: await countOf(
      invitationCreatedUsers,
      sql`${invitationCreatedUsers.invitationId} IN (SELECT ${authInvitation.id} FROM ${authInvitation} WHERE ${authInvitation.organizationId} IN ${demoOrganizationIds})`,
    ),
    auth_session: await countOf(authSession, sql`${authSession.userId} IN ${demoOnlyUserIds}`),
    auth_account: await countOf(authAccount, sql`${authAccount.userId} IN ${demoOnlyUserIds}`),
  };

  const [crossing] = await db
    .select({ n: count() })
    .from(reveals)
    .where(
      sql`(${isDemoAnimal} AND NOT ${isDemoShelterReveal}) OR (${isDemoShelterReveal} AND NOT ${isDemoAnimal})`,
    );
  const testKeyShelters = others.filter((row) => storedWith(row, testPolicy)).length;

  const refusals: DemoRemovalRefusal[] = [];
  if (demoShelters.length > 0 && others.length === 0) refusals.push({ kind: "no_real_shelter" });
  if (demoMembers > 0) refusals.push({ kind: "demo_shelter_has_members", members: demoMembers });
  if (demoSupportSessions > 0) {
    refusals.push({ kind: "demo_shelter_has_support_sessions", sessions: demoSupportSessions });
  }
  if (testKeyShelters > 0) {
    refusals.push({ kind: "test_key_on_real_shelter", shelters: testKeyShelters });
  }
  if ((crossing?.n ?? 0) > 0) {
    refusals.push({ kind: "reveal_crosses_the_corpus", reveals: crossing?.n ?? 0 });
  }

  return {
    demoShelters: demoShelters.map((s) => ({ id: s.id, displayName: s.displayName })),
    otherShelters: others.length,
    counts,
    cascades,
    demoMembers,
    demoSupportSessions,
    refusals,
  };
}

/** Thrown inside the transaction to roll it back; never reaches a caller as a partial removal. */
export class DemoRemovalDrift extends Error {
  constructor(
    readonly table: DemoRemovalTable,
    readonly planned: number,
    readonly deleted: number,
  ) {
    super(
      `demo:remove: ${table} deleted ${deleted} row(s), planned ${planned}; rolled back, nothing deleted`,
    );
  }
}

export async function removeDemoCorpus(
  db: Database,
  testPolicy: LocationPrivacyPolicy,
): Promise<DemoRemovalResult> {
  return db.transaction(async (tx) => {
    const plan = await planDemoRemoval(tx, testPolicy);
    if (plan.refusals.length > 0) return { kind: "refused", plan };
    if (plan.demoShelters.length === 0) return { kind: "nothing_to_remove", plan };

    // Captured before anything is deleted: deleting the invitations removes
    // the `invitation_created_users` rows that identify these users.
    const users = await tx
      .select({ id: authUser.id })
      .from(authUser)
      .where(TARGETS.auth_user.where);
    // Likewise the organizations: they are found through the demo shelters.
    const organizations = await tx
      .select({ id: shelters.organizationId })
      .from(shelters)
      .where(
        sql`${shelters.id} LIKE ${DEMO_ID_PATTERN} AND ${shelters.organizationId} IS NOT NULL`,
      );
    const organizationIds = organizations.flatMap((o) => (o.id === null ? [] : [o.id]));
    const userIds = users.map((u) => u.id);

    const deleted = {} as DemoRemovalCounts;
    const del = async (
      table: DemoRemovalTable,
      run: () => Promise<readonly unknown[]>,
    ): Promise<void> => {
      deleted[table] = (await run()).length;
      if (deleted[table] !== plan.counts[table]) {
        throw new DemoRemovalDrift(table, plan.counts[table], deleted[table]);
      }
    };

    await del("swipes", () =>
      tx.delete(swipes).where(TARGETS.swipes.where).returning({ id: swipes.animalId }),
    );
    await del("reveals", () =>
      tx.delete(reveals).where(TARGETS.reveals.where).returning({ id: reveals.animalId }),
    );
    await del("animals", () =>
      tx.delete(animals).where(TARGETS.animals.where).returning({ id: animals.id }),
    );
    await del("shelter_history", () =>
      tx
        .delete(shelterHistory)
        .where(TARGETS.shelter_history.where)
        .returning({ id: shelterHistory.id }),
    );
    await del("shelters", () =>
      tx.delete(shelters).where(TARGETS.shelters.where).returning({ id: shelters.id }),
    );
    // From here the demo shelters are gone, so the organizations are named by
    // the ids captured above rather than found through them.
    await del("auth_invitation", () =>
      organizationIds.length === 0
        ? Promise.resolve([])
        : tx
            .delete(authInvitation)
            .where(inArray(authInvitation.organizationId, organizationIds))
            .returning({ id: authInvitation.id }),
    );
    await del("auth_organization", () =>
      organizationIds.length === 0
        ? Promise.resolve([])
        : tx
            .delete(authOrganization)
            .where(inArray(authOrganization.id, organizationIds))
            .returning({ id: authOrganization.id }),
    );
    await del("auth_user", () =>
      userIds.length === 0
        ? Promise.resolve([])
        : tx.delete(authUser).where(inArray(authUser.id, userIds)).returning({ id: authUser.id }),
    );

    return { kind: "removed", plan, deleted };
  });
}

/** The `--expect` check (DR-B1, guard 3b): the target must be exactly that Neon compute. */
export type ExpectedTarget = { kind: "ok" } | { kind: "refused"; reason: string };

export function expectedTargetOf(url: string, expect: string | undefined): ExpectedTarget {
  if (expect === undefined || !/^ep-[a-z0-9-]+$/.test(expect.trim().toLowerCase())) {
    return { kind: "refused", reason: "pass --expect ep-… (the target's Neon endpoint id)" };
  }
  const target = databaseTargetOf(url);
  if (target.kind !== "neon") {
    return { kind: "refused", reason: "the target is not a Neon endpoint" };
  }
  const expected = expect
    .trim()
    .toLowerCase()
    .replace(/-pooler$/, "");
  return target.endpoint === expected
    ? { kind: "ok" }
    : { kind: "refused", reason: "the target's Neon endpoint is not --expect" };
}

const pad = (label: string) => label.padEnd(18);

export function formatPlan(plan: DemoRemovalPlan, heading: "Would delete" | "Deleted"): string[] {
  const lines = [`Demo shelters (${plan.demoShelters.length}):`];
  for (const s of plan.demoShelters) lines.push(`  ${s.id}  ${s.displayName}`);
  lines.push(`Other shelters: ${plan.otherShelters} (they stay)`);
  // Printed even at 0: DR-Q1 (b) is decided "with the number in front of me".
  lines.push(
    `Support sessions on demo shelters: ${plan.demoSupportSessions} (never deleted; any is a refusal)`,
  );
  lines.push(`${heading}:`);
  for (const table of DEMO_REMOVAL_TABLES) lines.push(`  ${pad(table)}${plan.counts[table]}`);
  lines.push("Removed with them by cascade:");
  for (const [table, n] of Object.entries(plan.cascades)) lines.push(`  ${pad(table)}${n}`);
  return lines;
}

export function formatRefusal(refusal: DemoRemovalRefusal): string {
  switch (refusal.kind) {
    case "no_real_shelter":
      return "REFUSED: no shelter outside the demo range exists; removing the demo corpus would leave the site empty.";
    case "demo_shelter_has_members":
      return `REFUSED: ${refusal.members} member(s) still belong to a demo shelter; remove them with registry/admins/remove first.`;
    case "test_key_on_real_shelter":
      return `REFUSED: ${refusal.shelters} shelter(s) outside the demo range use the seed's test-only location key (privacy bug, RG-Q11); fix that first.`;
    case "demo_shelter_has_support_sessions":
      return `REFUSED: ${refusal.sessions} support session(s) exist on demo shelters. They are never deleted (RS-Q0), so those shelters can't go; this count is Oleksii's to decide on (DR-Q1).`;
    case "reveal_crosses_the_corpus":
      return `REFUSED: ${refusal.reveals} reveal(s) link a demo animal to a non-demo shelter or the reverse; deleting them would touch rows outside the corpus.`;
    /* v8 ignore next 4 -- exists so the compiler rejects an unhandled kind; unreachable at runtime */
    default: {
      const unreachable: never = refusal;
      throw new Error(`Unhandled refusal ${JSON.stringify(unreachable)}`);
    }
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const at = process.argv.indexOf("--expect");
  const expected = expectedTargetOf(url, at > -1 ? process.argv[at + 1] : undefined);
  if (expected.kind === "refused") {
    console.error(`REFUSED: ${expected.reason}. Nothing was run.`);
    process.exit(1);
  }
  const commit = process.argv.includes("--commit");
  assertProductionWriteAllowed(url, process.argv, process.env, commit ? "write" : "read");
  console.log(databaseTargetLine(url));
  if (process.env.NODE_ENV === "production") {
    console.error(
      "ERROR: run without NODE_ENV=production: recognising the test-only location key needs the seed's policy.",
    );
    process.exit(1);
  }

  // postgres-js, not `createDatabase`: on a Neon host that picks neon-http,
  // which has no interactive transactions, and the removal must be one.
  const client = postgres(url, { max: 1 });
  const db = createDatabaseWithClient(client);
  const testPolicy = testOnlyLocationPolicy(SEED_LOCATION_POLICY_KEY);
  let exitCode: 0 | 1 = 0;
  try {
    const plan = await planDemoRemoval(db, testPolicy);
    console.log(commit ? "COMMIT" : "DRY RUN (nothing is deleted)");
    for (const line of formatPlan(plan, "Would delete")) console.log(line);
    if (plan.refusals.length > 0) {
      for (const refusal of plan.refusals) console.error(formatRefusal(refusal));
      exitCode = 1;
    } else if (plan.demoShelters.length === 0) {
      console.log("Nothing to remove: no demo shelters.");
    } else if (!commit) {
      console.log("Dry run only. Re-run with --commit to delete.");
    } else {
      const result = await removeDemoCorpus(db, testPolicy);
      if (result.kind === "removed") {
        console.log("Deleted:");
        for (const table of DEMO_REMOVAL_TABLES) {
          console.log(`  ${pad(table)}${result.deleted[table]}`);
        }
        console.log("Done. Run the dry run again: every count should be 0.");
      } else if (result.kind === "refused") {
        // The plan changed between the dry-run read and the transaction.
        for (const refusal of result.plan.refusals) console.error(formatRefusal(refusal));
        exitCode = 1;
      } else {
        console.log("Nothing to remove: no demo shelters.");
      }
    }
  } catch (error) {
    console.error(error instanceof DemoRemovalDrift ? error.message : error);
    exitCode = 1;
  } finally {
    await client.end();
  }
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
