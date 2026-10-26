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
 * `--shelter <id>` (repeatable; DR-F2, answered in DR-B3) points the same
 * removal at exactly those shelters instead of the seed range: Oleksii's own
 * test shelters, onboarded on production with the real key and ids outside
 * the range. One script rather than a sibling, because the two differ only in
 * which shelters are targeted; every guard, the transaction and the drift
 * check are the same code, so a fix to one can't miss the other. A run is one
 * or the other, never both: with `--shelter`, no demo shelter is touched.
 *
 * Usage (from the repo root; `PROD_NEON_ENDPOINT` from the shell or the root
 * `.env.local`, as for every production-aware script):
 *   pnpm --filter @opika/db demo:remove --expect ep-…                 dry run
 *   pnpm --filter @opika/db demo:remove --expect ep-… --commit        deletes
 *   … --prod                                                           when the target is production
 *   … --shelter <id> [--shelter <id> …]                                these shelters, not the seed range
 *
 * Refuses (exit 1, nothing deleted) when:
 *   - the target's Neon compute isn't exactly `--expect` (smoke scripts' rule);
 *   - no shelter outside the seed range exists: the site must never end up
 *     empty (DR-B1, guard 3a); with `--shelter`, when no shelter at all would
 *     remain (DR-B3, answer 3);
 *   - a targeted shelter still has a member: removing someone's access is
 *     `registry/admins/remove`'s job, recorded in that shelter's history
 *     (DR-B3, answer 1: "I remove admins first via registry/admins/remove");
 *   - a targeted shelter has a support session: RS-Q0 keeps those rows forever
 *     ("Rows never deleted"), and their foreign key doesn't cascade, so such a
 *     shelter can't go. Oleksii, DR-Q1 (b): "Never delete support sessions;
 *     demo:remove refuses while any demo shelter has one. If the count on
 *     production isn't 0 when I run it, I decide again with the number in
 *     front of me.";
 *   - a shelter outside the seed range sits on the seed's test-only location
 *     key (RG-Q11's privacy bug, the same rule as `location:verify`);
 *   - a reveal links a targeted animal to a shelter not targeted or the
 *     reverse, which no code path writes, so deleting it would touch a row
 *     outside the target set;
 *   - an argument the script doesn't take (`--shelters`, a stray word): a
 *     mistyped `--shelter` must never fall back to the seed range;
 *   - with `--shelter`: an id that isn't a UUID, is given twice, lies in the
 *     seed range, or names no shelter (DR-B3, answer 3);
 *   - NODE_ENV=production (recognising the test-only key needs the seed's policy).
 *
 * The deletion is one transaction, so it lands whole or not at all. It plans
 * again inside the transaction and rolls back if any table's deleted count
 * differs from that plan. A second dry run afterwards reports all zeros.
 *
 * This script itself never deletes photos from R2 - it holds no R2
 * credentials, and removing the `animals` rows just leaves their photos
 * unreferenced. The plan lists the R2 object keys of the targeted animals'
 * real photos so Oleksii can delete them by hand sooner than the grace
 * period (DR-B3, answer 2; the GDPR photo-retention job,
 * `docs/gdpr-analysis.md`, R2-B1, deletes them automatically once
 * unreferenced for long enough, with no action here) - a dedicated
 * immediate-deletion script is follow-up DR-F3, narrowed by R2-B1's
 * automatic sweep to a way of going sooner than the grace period, not the
 * only path left at all.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type LocationPrivacyPolicy, testOnlyLocationPolicy } from "@opika/domain";
import { count, inArray, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { createDatabaseWithClient, type Database } from "./client";
import { IMAGE_VARIANT_NAMES, isRealPhotoKey, variantObjectKey } from "./image-pipeline/variants";
import {
  assertProductionWriteAllowed,
  databaseTargetLine,
  expectedTargetOf,
  PROD_FLAG,
} from "./prod-guard";

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
import { isSeedShelterId, SEED_LOCATION_POLICY_KEY, SEED_SHELTER_ID_PREFIX } from "./seed-ids";
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

/**
 * Which shelters a run removes: the seed's reserved range (no `--shelter`,
 * the original behaviour), or exactly the listed ids. Build the second with
 * `parseRemovalTarget`, which refuses malformed and duplicate ids and never
 * yields an empty list; the plan refuses the rest (seed range, not found), so
 * a caller handing an id list straight to `planDemoRemoval` is still guarded.
 * An empty list from such a caller throws `EmptyRemovalTarget` before any SQL
 * runs: it names no shelter, and `IN ()` isn't valid SQL.
 */
export type RemovalTarget = { kind: "demo_range" } | { kind: "shelters"; ids: readonly string[] };
export const DEMO_RANGE: RemovalTarget = { kind: "demo_range" };

/** Thrown before any SQL for `{ kind: "shelters", ids: [] }`, which targets nothing. */
export class EmptyRemovalTarget extends Error {
  constructor() {
    super("demo:remove: a shelters target needs at least one id; nothing was run");
  }
}

export type DemoRemovalRefusal =
  | { kind: "no_real_shelter" }
  | { kind: "no_shelter_would_remain" }
  | { kind: "demo_shelter_has_members"; members: number }
  | { kind: "demo_shelter_has_support_sessions"; sessions: number }
  | { kind: "test_key_on_real_shelter"; shelters: number }
  | { kind: "reveal_crosses_the_corpus"; reveals: number }
  | { kind: "target_in_demo_range"; ids: readonly string[] }
  | { kind: "target_not_found"; ids: readonly string[] };

/**
 * Rows that go by foreign-key cascade rather than by a delete of their own,
 * shown so the dry run hides nothing (review of the pre-commit diff, finding
 * 4): `invitation_created_users` rows of the targeted invitations (including
 * those of users who stay, such as one who has since joined a real shelter),
 * and the sessions and accounts of the users deleted.
 */
export type DemoRemovalCascades = {
  invitation_created_users: number;
  auth_session: number;
  auth_account: number;
};

/**
 * The field names say "demo" because the seed range was the only target when
 * they were introduced; with `--shelter` they hold the targeted shelters
 * instead. Kept, not renamed, so #103's tests run unchanged against this
 * generalisation (inbox DR-T4).
 */
export type DemoRemovalPlan = {
  target: RemovalTarget;
  /** The targeted shelters that exist: printed by id and name (DR-B1 answer 3, DR-B3 answer 3). */
  demoShelters: readonly { id: string; displayName: string }[];
  /** Shelters not targeted, which stay: counted, never named, never touched. */
  otherShelters: number;
  counts: DemoRemovalCounts;
  cascades: DemoRemovalCascades;
  /** Members of a targeted shelter's organization: any at all is a refusal, so none is ever deleted. */
  demoMembers: number;
  /** Support sessions on a targeted shelter: any at all is a refusal (RS-Q0, DR-Q1), so none is ever deleted. */
  demoSupportSessions: number;
  /**
   * R2 object keys of the targeted animals' real photos (`animals/…`), every
   * variant. Left in R2 by this script (DR-B3, answer 2); listed so they can
   * be deleted by hand. Seed photos (`seed-photos/…`) are repo files, not R2
   * objects, so they never appear here.
   */
  photoObjectKeys: readonly string[];
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

/** Every SQL fragment that depends on which shelters are targeted, built once per run. */
type Scope = {
  isTargetShelter: (column: AnyPgColumn) => SQL;
  organizationIds: SQL;
  onlyUserIds: SQL;
  isTargetAnimalReveal: SQL;
  isTargetShelterReveal: SQL;
  targets: Record<DemoRemovalTable, { table: PgTable; where: SQL }>;
};

function scopeOf(target: RemovalTarget): Scope {
  if (target.kind === "shelters" && target.ids.length === 0) throw new EmptyRemovalTarget();
  // The seed range keeps its LIKE, so a run without `--shelter` issues the
  // same SQL as before `--shelter` existed.
  const isTargetShelter =
    target.kind === "demo_range"
      ? (column: AnyPgColumn) => sql`${column} LIKE ${DEMO_ID_PATTERN}`
      : (column: AnyPgColumn) =>
          sql`${column} IN (${sql.join(
            target.ids.map((id) => sql`${id}`),
            sql`, `,
          )})`;

  const animalIds = sql`(SELECT ${animals.id} FROM ${animals} WHERE ${isTargetShelter(animals.shelterId)})`;
  const organizationIds = sql`(SELECT ${shelters.organizationId} FROM ${shelters} WHERE ${isTargetShelter(shelters.id)} AND ${shelters.organizationId} IS NOT NULL)`;

  /**
   * Users whose only link was an invitation to a targeted shelter (DR-B1,
   * answer 2). `invitation_created_users` holds one row per user, the
   * invitation that created them, so "only" means none of the other links a
   * user can have: no super_admin row (active or revoked), no membership
   * anywhere, no support session as operator, no invitation sent, and no
   * invitation for their address to any shelter not targeted, in any status: a
   * user re-invited to a real shelter must stay, or that invitation could
   * never be accepted (sign-up is off; the invited-users sweep keeps the same
   * case, `kabinet-invited-users-repo.ts`).
   */
  const onlyUserIds = sql`(
  SELECT ${invitationCreatedUsers.userId} FROM ${invitationCreatedUsers}
  JOIN ${authInvitation} ON ${authInvitation.id} = ${invitationCreatedUsers.invitationId}
  JOIN ${authUser} ON ${authUser.id} = ${invitationCreatedUsers.userId}
  WHERE ${authInvitation.organizationId} IN ${organizationIds}
    AND NOT EXISTS (SELECT 1 FROM ${superAdmins} WHERE ${superAdmins.userId} = ${invitationCreatedUsers.userId})
    AND NOT EXISTS (SELECT 1 FROM ${authMember} WHERE ${authMember.userId} = ${invitationCreatedUsers.userId})
    AND NOT EXISTS (SELECT 1 FROM ${supportSessions} WHERE ${supportSessions.operatorUserId} = ${invitationCreatedUsers.userId})
    AND NOT EXISTS (SELECT 1 FROM "auth_invitation" AS sent WHERE sent.inviter_id = ${invitationCreatedUsers.userId})
    AND NOT EXISTS (
      SELECT 1 FROM "auth_invitation" AS elsewhere
      WHERE elsewhere.email = ${authUser.email}
        AND elsewhere.organization_id NOT IN ${organizationIds}
    )
)`;

  const isTargetAnimalReveal = sql`${reveals.animalId} IN ${animalIds}`;
  const isTargetShelterReveal = isTargetShelter(reveals.shelterId);

  /** What each table's deletion targets; the plan counts exactly these rows. */
  const targets: Scope["targets"] = {
    swipes: { table: swipes, where: sql`${swipes.animalId} IN ${animalIds}` },
    reveals: {
      table: reveals,
      where: sql`(${isTargetAnimalReveal} OR ${isTargetShelterReveal})`,
    },
    animals: { table: animals, where: isTargetShelter(animals.shelterId) },
    shelter_history: { table: shelterHistory, where: isTargetShelter(shelterHistory.shelterId) },
    shelters: { table: shelters, where: isTargetShelter(shelters.id) },
    auth_invitation: {
      table: authInvitation,
      where: sql`${authInvitation.organizationId} IN ${organizationIds}`,
    },
    auth_organization: {
      table: authOrganization,
      where: sql`${authOrganization.id} IN ${organizationIds}`,
    },
    auth_user: { table: authUser, where: sql`${authUser.id} IN ${onlyUserIds}` },
  };

  return {
    isTargetShelter,
    organizationIds,
    onlyUserIds,
    isTargetAnimalReveal,
    isTargetShelterReveal,
    targets,
  };
}

/** Every R2 object one real photo occupies: its variants (no original is stored, `upload-animal-photo.ts`). */
const photoObjectKeysOf = (photos: readonly { storageKey: string }[]): string[] =>
  photos
    .filter((photo) => isRealPhotoKey(photo.storageKey))
    .flatMap((photo) => IMAGE_VARIANT_NAMES.map((v) => variantObjectKey(photo.storageKey, v)));

export async function planDemoRemoval(
  db: Executor,
  testPolicy: LocationPrivacyPolicy,
  target: RemovalTarget = DEMO_RANGE,
): Promise<DemoRemovalPlan> {
  const scope = scopeOf(target);
  const countWhere = async (table: DemoRemovalTable): Promise<number> => {
    const { table: from, where } = scope.targets[table];
    const [row] = await db.select({ n: count() }).from(from).where(where);
    return row?.n ?? 0;
  };

  const demoShelters = await db
    .select({ id: shelters.id, displayName: shelters.displayName })
    .from(shelters)
    .where(scope.isTargetShelter(shelters.id))
    .orderBy(shelters.id);
  // The shelters that stay: what "would leave zero shelters" counts.
  const [remaining] = await db
    .select({ n: count() })
    .from(shelters)
    .where(sql`NOT (${scope.isTargetShelter(shelters.id)})`);
  // The test-only-key rule is about shelters outside the seed range whatever
  // the target: the seed's own shelters sit on that key by design.
  const outsideSeedRange = await db
    .select({
      id: shelters.id,
      exactAddress: shelters.exactAddress,
      publicLocation: shelters.publicLocation,
    })
    .from(shelters)
    .where(sql`${shelters.id} NOT LIKE ${DEMO_ID_PATTERN}`);

  const counts = {} as DemoRemovalCounts;
  for (const table of DEMO_REMOVAL_TABLES) counts[table] = await countWhere(table);
  const countOf = async (table: PgTable, where: SQL) =>
    (await db.select({ n: count() }).from(table).where(where))[0]?.n ?? 0;
  const demoSupportSessions = await countOf(
    supportSessions,
    scope.isTargetShelter(supportSessions.shelterId),
  );
  const demoMembers = await countOf(
    authMember,
    sql`${authMember.organizationId} IN ${scope.organizationIds}`,
  );
  const cascades: DemoRemovalCascades = {
    invitation_created_users: await countOf(
      invitationCreatedUsers,
      sql`${invitationCreatedUsers.invitationId} IN (SELECT ${authInvitation.id} FROM ${authInvitation} WHERE ${authInvitation.organizationId} IN ${scope.organizationIds})`,
    ),
    auth_session: await countOf(authSession, sql`${authSession.userId} IN ${scope.onlyUserIds}`),
    auth_account: await countOf(authAccount, sql`${authAccount.userId} IN ${scope.onlyUserIds}`),
  };

  const [crossing] = await db
    .select({ n: count() })
    .from(reveals)
    .where(
      sql`(${scope.isTargetAnimalReveal} AND NOT ${scope.isTargetShelterReveal}) OR (${scope.isTargetShelterReveal} AND NOT ${scope.isTargetAnimalReveal})`,
    );
  const testKeyShelters = outsideSeedRange.filter((row) => storedWith(row, testPolicy)).length;

  const targetPhotos = await db
    .select({ photos: animals.photos })
    .from(animals)
    .where(scope.targets.animals.where)
    .orderBy(animals.id);
  const photoObjectKeys = targetPhotos.flatMap((row) => photoObjectKeysOf(row.photos));

  const otherShelters = remaining?.n ?? 0;
  const refusals: DemoRemovalRefusal[] = [];
  if (target.kind === "shelters") {
    // Here, not in `parseRemovalTarget`: "not found" needs the database, and
    // the seed-range rule belongs with the plan so that any caller handing
    // ids straight to the plan is refused too, not only the CLI.
    const inSeedRange = target.ids.filter(isSeedShelterId);
    if (inSeedRange.length > 0) refusals.push({ kind: "target_in_demo_range", ids: inSeedRange });
    const found = new Set<string>(demoShelters.map((s) => s.id));
    const missing = target.ids.filter((id) => !found.has(id));
    if (missing.length > 0) refusals.push({ kind: "target_not_found", ids: missing });
    if (demoShelters.length > 0 && otherShelters === 0) {
      refusals.push({ kind: "no_shelter_would_remain" });
    }
  } else if (demoShelters.length > 0 && otherShelters === 0) {
    refusals.push({ kind: "no_real_shelter" });
  }
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
    target,
    demoShelters: demoShelters.map((s) => ({ id: s.id, displayName: s.displayName })),
    otherShelters,
    counts,
    cascades,
    demoMembers,
    demoSupportSessions,
    photoObjectKeys,
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
  target: RemovalTarget = DEMO_RANGE,
): Promise<DemoRemovalResult> {
  const { targets, isTargetShelter } = scopeOf(target);
  return db.transaction(async (tx) => {
    const plan = await planDemoRemoval(tx, testPolicy, target);
    if (plan.refusals.length > 0) return { kind: "refused", plan };
    if (plan.demoShelters.length === 0) return { kind: "nothing_to_remove", plan };

    // Captured before anything is deleted: deleting the invitations removes
    // the `invitation_created_users` rows that identify these users.
    const users = await tx
      .select({ id: authUser.id })
      .from(authUser)
      .where(targets.auth_user.where);
    // Likewise the organizations: they are found through the targeted shelters.
    const organizations = await tx
      .select({ id: shelters.organizationId })
      .from(shelters)
      .where(sql`${isTargetShelter(shelters.id)} AND ${shelters.organizationId} IS NOT NULL`);
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
      tx.delete(swipes).where(targets.swipes.where).returning({ id: swipes.animalId }),
    );
    await del("reveals", () =>
      tx.delete(reveals).where(targets.reveals.where).returning({ id: reveals.animalId }),
    );
    await del("animals", () =>
      tx.delete(animals).where(targets.animals.where).returning({ id: animals.id }),
    );
    await del("shelter_history", () =>
      tx
        .delete(shelterHistory)
        .where(targets.shelter_history.where)
        .returning({ id: shelterHistory.id }),
    );
    await del("shelters", () =>
      tx.delete(shelters).where(targets.shelters.where).returning({ id: shelters.id }),
    );
    // From here the targeted shelters are gone, so the organizations are named
    // by the ids captured above rather than found through them.
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A short token of letters, digits and dashes: safe to print back, unlike anything that could hold a password. */
const SAFE_TO_ECHO = /^[A-Za-z0-9-]{1,64}$/;

const ARGUMENTS_TAKEN = "--expect <ep>, --commit, --prod and --shelter <id>";
/** A flag's spelling is echoed in a refusal; anything else might be a pasted URL, so it never is. */
const FLAG_SPELLING = /^-{1,2}[A-Za-z][A-Za-z0-9-]*$/;

/**
 * Reads the whole command line (`process.argv`: the runtime and the script
 * path first) and returns which shelters to remove. No `--shelter`: the seed
 * range, today's behaviour. The arguments taken are exactly `--expect <ep>`,
 * `--commit`, `--prod` and `--shelter <id>`; anything else is refused, so
 * nothing runs:
 *   - any other argument, a flag or not (`--shelters`, `--Shelter`,
 *     `--shelter-id`, a stray word): a mistyped `--shelter` would otherwise
 *     be ignored and the run fall back to the seed range, deleting the whole
 *     demo corpus on a database where the operator's own test shelters pass
 *     every guard as "a shelter outside the range" (review finding 1, DR-T5);
 *   - `--shelter` with no value, or followed by another flag, for the same
 *     reason;
 *   - `--shelter=<id>`: not a form this parser reads, refused rather than
 *     ignored;
 *   - an id that isn't a UUID: every shelter id is one (`crypto.randomUUID`,
 *     `deterministicId`), so anything else is a paste error;
 *   - an id given twice. Refused rather than deduplicated: in a destructive
 *     command a repeated id most likely stands where a different one was
 *     meant, and that one would silently stay (inbox DR-T5);
 *   - `--expect` with no value, or given twice: `main` reads the first one
 *     only, so a second could name a different compute and be ignored.
 * Whether the `--expect` value is a valid endpoint id is `expectedTargetOf`'s
 * check, not this one's. Ids are lower-cased first, the form every id is
 * minted in, so a pasted upper-case id is found rather than reported missing.
 */
export function parseRemovalTarget(
  argv: readonly string[],
): RemovalTarget | { kind: "refused"; reason: string } {
  const ids: string[] = [];
  let expectSeen = false;
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    const value = args[i + 1];
    if (arg === "--commit" || arg === PROD_FLAG) continue;
    if (arg === "--expect") {
      if (value === undefined || value.startsWith("-")) {
        return { kind: "refused", reason: "--expect needs an endpoint id after it" };
      }
      if (expectSeen) return { kind: "refused", reason: "--expect is given twice" };
      expectSeen = true;
      i++;
      continue;
    }
    if (arg.startsWith("--shelter=")) {
      return { kind: "refused", reason: "write --shelter <id>, not --shelter=<id>" };
    }
    if (arg !== "--shelter") {
      const what = FLAG_SPELLING.test(arg)
        ? `${arg} is not an argument this script takes`
        : `argument ${i + 1} is not one this script takes`;
      return { kind: "refused", reason: `${what}; it takes ${ARGUMENTS_TAKEN}` };
    }
    if (value === undefined || value.startsWith("--")) {
      return { kind: "refused", reason: "--shelter needs a shelter id after it" };
    }
    const id = value.trim().toLowerCase();
    if (!UUID_PATTERN.test(id)) {
      // Echo it only when it can't be a secret: a pasted connection string in
      // this slot must not reach the terminal (review of the notes, finding 1).
      const shown = SAFE_TO_ECHO.test(value) ? value : `(argument ${i + 2})`;
      return { kind: "refused", reason: `--shelter ${shown} is not a shelter id (a UUID)` };
    }
    if (ids.includes(id)) {
      return { kind: "refused", reason: `--shelter ${id} is given twice` };
    }
    ids.push(id);
    i++;
  }
  return ids.length === 0 ? DEMO_RANGE : { kind: "shelters", ids };
}

/**
 * The last line of a committed run: what the next dry run shows. For
 * `--shelter`, that dry run refuses each removed id as not found (DR-T6),
 * which is the confirmation they are gone, not a failure (review finding 3).
 */
export function closingLine(target: RemovalTarget): string {
  if (target.kind === "demo_range") return "Done. Run the dry run again: every count should be 0.";
  const notFound = formatRefusal({ kind: "target_not_found", ids: target.ids }, target);
  return `Done. Run the dry run again with the same --shelter ids: every count should be 0, and it refuses with "${notFound}" That refusal is the confirmation that they are gone.`;
}

const pad = (label: string) => label.padEnd(18);
const noun = (target: RemovalTarget) => (target.kind === "demo_range" ? "demo" : "target");

/**
 * The photo keys, printed whenever `--shelter` is used (even at 0, so the
 * operator sees there is nothing to clean up) or any key exists. A seed-range
 * run has none, seed photos being repo files, so its output is unchanged.
 */
export function formatPhotoKeys(plan: DemoRemovalPlan): string[] {
  if (plan.target.kind === "demo_range" && plan.photoObjectKeys.length === 0) return [];
  return [
    `R2 photo objects of these animals: ${plan.photoObjectKeys.length} (left in R2, unlinked; delete by hand in Cloudflare if wanted)`,
    ...plan.photoObjectKeys.map((key) => `  ${key}`),
  ];
}

export function formatPlan(plan: DemoRemovalPlan, heading: "Would delete" | "Deleted"): string[] {
  const label = noun(plan.target);
  const lines = [`${label === "demo" ? "Demo" : "Target"} shelters (${plan.demoShelters.length}):`];
  for (const s of plan.demoShelters) lines.push(`  ${s.id}  ${s.displayName}`);
  lines.push(`Other shelters: ${plan.otherShelters} (they stay)`);
  // Printed even at 0: DR-Q1 (b) is decided "with the number in front of me".
  lines.push(
    `Support sessions on ${label} shelters: ${plan.demoSupportSessions} (never deleted; any is a refusal)`,
  );
  lines.push(`${heading}:`);
  for (const table of DEMO_REMOVAL_TABLES) lines.push(`  ${pad(table)}${plan.counts[table]}`);
  lines.push("Removed with them by cascade:");
  for (const [table, n] of Object.entries(plan.cascades)) lines.push(`  ${pad(table)}${n}`);
  lines.push(...formatPhotoKeys(plan));
  return lines;
}

export function formatRefusal(
  refusal: DemoRemovalRefusal,
  target: RemovalTarget = DEMO_RANGE,
): string {
  const label = noun(target);
  switch (refusal.kind) {
    case "no_real_shelter":
      return "REFUSED: no shelter outside the demo range exists; removing the demo corpus would leave the site empty.";
    case "no_shelter_would_remain":
      return "REFUSED: no shelter would remain after removing these; the site must never end up empty.";
    case "demo_shelter_has_members":
      return `REFUSED: ${refusal.members} member(s) still belong to a ${label} shelter; remove them with registry/admins/remove first.`;
    case "test_key_on_real_shelter":
      return `REFUSED: ${refusal.shelters} shelter(s) outside the demo range use the seed's test-only location key (privacy bug, RG-Q11); fix that first.`;
    case "demo_shelter_has_support_sessions":
      return `REFUSED: ${refusal.sessions} support session(s) exist on ${label} shelters. They are never deleted (RS-Q0), so those shelters can't go; this count is Oleksii's to decide on (DR-Q1).`;
    case "reveal_crosses_the_corpus":
      return `REFUSED: ${refusal.reveals} reveal(s) link a ${label} animal to a non-${label} shelter or the reverse; deleting them would touch rows outside the corpus.`;
    case "target_in_demo_range":
      return `REFUSED: ${refusal.ids.join(", ")} lie(s) in the demo range; run without --shelter to remove the demo corpus.`;
    case "target_not_found":
      return `REFUSED: no shelter has id ${refusal.ids.join(", ")}.`;
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
  const target = parseRemovalTarget(process.argv);
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run.`);
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
  const nothing = `Nothing to remove: no ${noun(target)} shelters.`;
  let exitCode: 0 | 1 = 0;
  try {
    const plan = await planDemoRemoval(db, testPolicy, target);
    console.log(commit ? "COMMIT" : "DRY RUN (nothing is deleted)");
    for (const line of formatPlan(plan, "Would delete")) console.log(line);
    if (plan.refusals.length > 0) {
      for (const refusal of plan.refusals) console.error(formatRefusal(refusal, target));
      exitCode = 1;
    } else if (plan.demoShelters.length === 0) {
      console.log(nothing);
    } else if (!commit) {
      console.log("Dry run only. Re-run with --commit to delete.");
    } else {
      const result = await removeDemoCorpus(db, testPolicy, target);
      if (result.kind === "removed") {
        console.log("Deleted:");
        for (const table of DEMO_REMOVAL_TABLES) {
          console.log(`  ${pad(table)}${result.deleted[table]}`);
        }
        for (const line of formatPhotoKeys(result.plan)) console.log(line);
        console.log(closingLine(target));
      } else if (result.kind === "refused") {
        // The plan changed between the dry-run read and the transaction.
        for (const refusal of result.plan.refusals) console.error(formatRefusal(refusal, target));
        exitCode = 1;
      } else {
        console.log(nothing);
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
