/**
 * `shelters:delete-test` (owner, 2026-11-18): removes ONE pre-launch rehearsal shelter, so its
 * registrant's address can register again. It goes through the application deletion service's
 * own batch (`applicationDeletionRepo.deleteRehearsal`): the shelter and its rows, the registrant's
 * user, sessions, accounts, verification rows, email tokens, membership and organization, in one
 * transaction that re-checks every guard under the rows' locks. A support session keeps its row,
 * shelter nulled (0029). R2 photos are left to the photo clean-up job.
 *
 * The audit line is written with the reason `not_me` (owner: no migration for a reason of its
 * own), so after a deletion the command prints the line to add to
 * `docs/prelaunch/rehearsal-log.md` (owner: never written here, since production runs from a
 * sitting worktree): these rows are rehearsals, never real «Це не я» events.
 *
 * Usage (from the repo root; `PROD_NEON_ENDPOINT` from the shell or the root `.env.local`):
 *   pnpm --filter @opika/db shelters:delete-test --shelter-id <uuid> --expect-name "<name>"
 *   … --prod --expect ep-…                     dry run on production
 *   … --prod --expect ep-… --commit            deletes
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type ShelterId, ShelterIdSchema } from "@opika/domain";
import postgres from "postgres";
import { createDatabaseWithClient, type Database } from "./client";
import {
  assertProductionWriteAllowed,
  checkProductionWrite,
  databaseTargetLine,
  databaseTargetOf,
  expectedTargetOf,
  PROD_FLAG,
  productionEndpoint,
  refusalMessage,
} from "./prod-guard";
import {
  applicationDeletionRepo,
  REHEARSAL_LISTED_KINDS,
  REHEARSAL_STATUSES,
  type RehearsalCandidate,
} from "./repos/application-deletion-repo";

export const REHEARSAL_LOG_BEGIN = "---- paste into docs/prelaunch/rehearsal-log.md ----";
export const REHEARSAL_LOG_END = "---- end ----";

export type DeleteTestArgs =
  | {
      kind: "ok";
      shelterId: ShelterId;
      expectedName: string;
      commit: boolean;
      endpoint: string | undefined;
    }
  | { kind: "refused"; reason: string };

const TAKES =
  'it takes --shelter-id <uuid>, --expect-name "<display name>", --commit, --prod and --expect ep-…';

export function parseDeleteTestArgs(argv: readonly string[]): DeleteTestArgs {
  const args = argv.slice(2);
  let shelterId: string | undefined;
  let expectedName: string | undefined;
  let endpoint: string | undefined;
  let commit = false;
  const valueAfter = (i: number) => {
    const value = args[i + 1];
    return value === undefined || value.startsWith("--") ? undefined : value;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--commit") {
      commit = true;
      continue;
    }
    if (arg === PROD_FLAG) continue;
    if (arg === "--shelter-id" || arg === "--expect-name" || arg === "--expect") {
      const value = valueAfter(i);
      if (value === undefined) return { kind: "refused", reason: `${arg} needs a value after it` };
      const seen =
        arg === "--shelter-id" ? shelterId : arg === "--expect" ? endpoint : expectedName;
      if (seen !== undefined) return { kind: "refused", reason: `${arg} is given twice` };
      if (arg === "--shelter-id") shelterId = value;
      else if (arg === "--expect") endpoint = value;
      else expectedName = value;
      i++;
      continue;
    }
    return { kind: "refused", reason: `argument ${i + 1} is not one this script takes; ${TAKES}` };
  }
  const id = ShelterIdSchema.safeParse(shelterId);
  if (!id.success) return { kind: "refused", reason: "--shelter-id needs a shelter's uuid" };
  if (expectedName === undefined || expectedName === "") {
    return { kind: "refused", reason: "--expect-name needs the shelter's exact display name" };
  }
  return { kind: "ok", shelterId: id.data, expectedName, commit, endpoint };
}

/** The target checks, before anything runs: a non-local target must be `--expect`'s exact compute, production needs `--prod`. */
export function targetRefusalOf(
  url: string,
  argv: readonly string[],
  endpoint: string | undefined,
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  if (databaseTargetOf(url).kind !== "local") {
    const expected = expectedTargetOf(url, endpoint);
    if (expected.kind === "refused") return `REFUSED: ${expected.reason}. Nothing was run.`;
  }
  const check = checkProductionWrite(url, argv, productionEndpoint(env), env);
  return check.kind === "refused" ? refusalMessage(check) : null;
}

export type RehearsalRefusal =
  | "not_found"
  | "name_mismatch"
  | "operator_created"
  | "status"
  | "animal_ever_served"
  | "animal_listed";

const REFUSAL_TEXT: Record<RehearsalRefusal, string> = {
  not_found: "no shelter has this id",
  name_mismatch: "its display name is not --expect-name exactly",
  operator_created: "it was created by the operator, not self-registered",
  status: `its status is not one of ${REHEARSAL_STATUSES.join(", ")}`,
  animal_ever_served: "one of its animals has been shown publicly (ever_served_at is set)",
  animal_listed: `one of its animals is ${REHEARSAL_LISTED_KINDS.join("/")} now`,
};

/** The first guard the shelter fails, in the order the owner listed them; null when it passes all. */
export function rehearsalRefusalOf(
  candidate: RehearsalCandidate | null,
  expectedName: string,
): RehearsalRefusal | null {
  if (candidate === null) return "not_found";
  if (candidate.displayName !== expectedName) return "name_mismatch";
  if (candidate.source !== "self_registration") return "operator_created";
  if (!(REHEARSAL_STATUSES as readonly string[]).includes(candidate.status)) return "status";
  if (candidate.everServed > 0) return "animal_ever_served";
  if (candidate.listedNow > 0) return "animal_listed";
  return null;
}

export type DeleteTestReport = {
  lines: string[];
  outcome: "dry_run" | "deleted" | "refused";
  deletionId: string | null;
};

/** One run: describe, check, and (on `commit`) delete and log. */
export async function runDeleteTestShelter(
  db: Database,
  input: {
    shelterId: ShelterId;
    expectedName: string;
    commit: boolean;
    now: Date;
  },
): Promise<DeleteTestReport> {
  const repo = applicationDeletionRepo(db);
  const candidate = await repo.rehearsalCandidate(input.shelterId);
  const lines: string[] = [];
  if (candidate !== null) {
    lines.push(
      `Shelter: ${candidate.id}`,
      `Display name: ${candidate.displayName}`,
      `Status: ${candidate.status}`,
      `Registration source: ${candidate.source}`,
      `Registrant email domain: ${candidate.registrantEmailDomain ?? "(no registrant)"}`,
      `Animals: ${candidate.animals} (${candidate.drafts} drafts, ${candidate.everServed} ever shown, ${candidate.listedNow} listed now)`,
    );
  }
  const refusal = rehearsalRefusalOf(candidate, input.expectedName);
  if (refusal !== null) {
    lines.push(`REFUSED: ${REFUSAL_TEXT[refusal]}. Nothing was written.`);
    return { lines, outcome: "refused", deletionId: null };
  }
  lines.push(
    "Would delete: the shelter, its history, animals and photo rows (R2 objects go with the photo clean-up job), the registrant's user, sessions, accounts, reset and sign-in links, email tokens, membership and organization; a support session stays with its shelter nulled.",
  );
  if (!input.commit) {
    lines.push("DRY RUN: nothing deleted. Re-run with --commit to delete.");
    return { lines, outcome: "dry_run", deletionId: null };
  }
  const deleted = await repo.deleteRehearsal(input.shelterId, input.expectedName, input.now);
  if (deleted.kind === "refused") {
    lines.push("REFUSED: the shelter changed under the deletion's lock. Nothing was written.");
    return { lines, outcome: "refused", deletionId: null };
  }
  lines.push(
    `Deleted. application_deletions row: ${deleted.deletionId} (reason not_me: a rehearsal, add the line below to the log).`,
    REHEARSAL_LOG_BEGIN,
    rehearsalLogLine(input.now, deleted.deletionId, input.shelterId),
    REHEARSAL_LOG_END,
  );
  return { lines, outcome: "deleted", deletionId: deleted.deletionId };
}

/** The log's line for one deletion: the UTC date and the ids only, no name, no address. */
export function rehearsalLogLine(now: Date, deletionId: string, shelterId: string): string {
  return `- ${now.toISOString().slice(0, 10)} · application_deletions ${deletionId} · shelter ${shelterId} · rehearsal, not a real «Це не я»`;
}

const out = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const err = (line: unknown): void => {
  process.stderr.write(`${line instanceof Error ? (line.stack ?? line.message) : String(line)}\n`);
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    err("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const args = parseDeleteTestArgs(process.argv);
  if (args.kind === "refused") {
    err(`REFUSED: ${args.reason}. Nothing was run.`);
    process.exit(1);
  }
  const refused = targetRefusalOf(url, process.argv, args.endpoint, process.env);
  if (refused !== null) {
    err(refused);
    process.exit(1);
  }
  assertProductionWriteAllowed(url, process.argv, process.env, args.commit ? "write" : "read");
  out(databaseTargetLine(url));
  const client = postgres(url, { max: 1 });
  const db = createDatabaseWithClient(client);
  let exitCode: 0 | 1 = 0;
  try {
    const report = await runDeleteTestShelter(db, {
      shelterId: args.shelterId,
      expectedName: args.expectedName,
      commit: args.commit,
      now: new Date(),
    });
    for (const line of report.lines) out(line);
    if (report.outcome === "refused") exitCode = 1;
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
