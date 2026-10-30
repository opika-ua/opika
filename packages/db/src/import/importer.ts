import type { Database } from "../client";
import { CodifierError, parseCodifier } from "./codifier";
import { PINNED_EDITIONS, type PinnedEdition, sha256Of } from "./editions";
import { type Plan, PlanError, planImport } from "./plan";
import {
  type PostImportMaintenance,
  runPostImportMaintenance,
  type VerifyTiming,
} from "./post-import-maintenance";
import {
  applyPlan,
  loadExisting,
  migration0020Present,
  referencedAmong,
  regionsMatchConstant,
  summariseStored,
} from "./run";
import { readFirstSheet } from "./xlsx";

export type ImportOutcome =
  | { kind: "refused"; reasons: readonly string[] }
  | {
      kind: "planned" | "committed";
      edition: PinnedEdition;
      plan: Plan;
      /** Parser facts that only the real file can check: printed, never asserted. */
      source: { apostropheConversions: number; withoutParentName: number };
      /** What the table held before this run: printed first, so a paste shows the starting point. */
      preflight: Preflight;
      stored: Awaited<ReturnType<typeof summariseStored>> | null;
      /** After a commit: what a second plan still wants to change. Zero when the run converged. */
      remaining: number | null;
      /** After a commit: ANALYZE and the GIN pending-list merge, each a value. Null on a dry run. */
      maintenance: PostImportMaintenance | null;
    };

export type Preflight = {
  cities: number;
  withCode: number;
  withoutCode: number;
  aliases: number;
};

const remainingChanges = (plan: Plan) =>
  plan.inserts.length +
  plan.adoptions.length +
  plan.updates.length +
  plan.aliases.length +
  plan.retirements.length;

/**
 * The importer without its CLI: bytes in, a plan out, and with `commit` the plan applied. Every
 * refusal is a value, so the CLI prints it and a test asserts it. It never reads the environment
 * and never decides which database it is allowed to touch: that is the CLI's guard.
 */
export async function runImport(input: {
  db: Database;
  bytes: Uint8Array;
  commit: boolean;
  /** The pins to check against; tests pass their own, because the real file is never in the repo. */
  editions?: readonly PinnedEdition[];
  /** How long the ANALYZE check waits for the statistics to show; tests shorten it. */
  verify?: VerifyTiming;
}): Promise<ImportOutcome> {
  const { db, bytes, commit } = input;
  const digest = sha256Of(bytes);
  const edition = (input.editions ?? PINNED_EDITIONS).find((e) => e.sha256 === digest) ?? null;
  if (edition === null) {
    return {
      kind: "refused",
      reasons: [
        "the file's sha256 matches no pinned edition (packages/db/src/import/editions.ts); a new edition is pinned by hand after reading its dry run",
      ],
    };
  }

  let parsed: ReturnType<typeof parseCodifier>;
  try {
    parsed = parseCodifier(readFirstSheet(bytes));
  } catch (error) {
    if (error instanceof CodifierError) return { kind: "refused", reasons: error.problems };
    throw error;
  }
  const found = {
    K: parsed.counts.K,
    M: parsed.counts.M,
    X: parsed.counts.X,
    C: parsed.counts.C,
  };
  const pinned = edition.settlements;
  if (
    found.K !== pinned.K ||
    found.M !== pinned.M ||
    found.X !== pinned.X ||
    found.C !== pinned.C
  ) {
    return {
      kind: "refused",
      reasons: [
        `the file parsed to K ${found.K}, M ${found.M}, X ${found.X}, C ${found.C} but edition ${edition.id} is pinned at K ${pinned.K}, M ${pinned.M}, X ${pinned.X}, C ${pinned.C}`,
      ],
    };
  }

  if (!(await migration0020Present(db))) {
    return {
      kind: "refused",
      reasons: [
        "migration 0020's columns or tables (cities.katottg_code and the other settlement columns, city_slug_aliases, regions) could not be read: it is not applied, or the database is unreachable",
      ],
    };
  }
  if (!(await regionsMatchConstant(db))) {
    return {
      kind: "refused",
      reasons: [
        "the regions table does not equal the 27-row constant: migration 0020 is not applied",
      ],
    };
  }

  const existing = await loadExisting(db);
  const withCode = existing.cities.filter((c) => c.katottgCode !== null).length;
  const preflight: Preflight = {
    cities: existing.cities.length,
    withCode,
    withoutCode: existing.cities.length - withCode,
    aliases: existing.aliases.length,
  };
  let plan: Plan;
  try {
    plan = planImport({
      edition: edition.id,
      settlements: parsed.settlements,
      existing: existing.cities,
      aliases: existing.aliases,
    });
  } catch (error) {
    if (error instanceof PlanError) return { kind: "refused", reasons: error.problems };
    throw error;
  }

  const referenced = await referencedAmong(db, plan.retirements);
  if (referenced.length > 0) {
    return {
      kind: "refused",
      reasons: [
        `${referenced.length} settlement(s) disappeared from the file while a shelter or animal still points at them (${referenced.slice(0, 5).join(", ")}); re-point them first, nothing was written`,
      ],
    };
  }

  const source = {
    apostropheConversions: parsed.apostropheConversions,
    withoutParentName: parsed.withoutParentName,
  };
  if (!commit) {
    return {
      kind: "planned",
      edition,
      plan,
      source,
      preflight,
      stored: null,
      remaining: null,
      maintenance: null,
    };
  }

  await applyPlan(db, plan, edition.id);
  // After the data is committed, never before: the statistics and the index lists must describe the
  // imported table, and a failure here must not undo the commit.
  const maintenance = await runPostImportMaintenance(db, input.verify);
  const after = await loadExisting(db);
  const second = planImport({
    edition: edition.id,
    settlements: parsed.settlements,
    existing: after.cities,
    aliases: after.aliases,
  });
  return {
    kind: "committed",
    edition,
    plan,
    source,
    preflight,
    stored: await summariseStored(db),
    remaining: remainingChanges(second),
    maintenance,
  };
}
