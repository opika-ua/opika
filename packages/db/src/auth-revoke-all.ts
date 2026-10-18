/**
 * `auth:revoke-all`: deletes every kabinet sign-in, meaning every row of
 * `auth_session` and of `auth_verification`, and nothing else
 * (`repos/auth-revoke-repo.ts` says why only those two). It is the required
 * step after rotating `BETTER_AUTH_SECRET` (`docs/onboarding-a-shelter.md`,
 * "Rotating `BETTER_AUTH_SECRET`"). Oleksii, 2026-10-18 (KH-Q12 rotation),
 * verbatim: "In the runbook's BETTER_AUTH_SECRET rotation section, after the
 * redeploy, these two steps are REQUIRED (my steps, production, 5.1-safe block,
 * typed --expect-style target check first): DELETE FROM auth_session; DELETE
 * FROM auth_verification;".
 *
 * A script, not a statement pasted into Neon's SQL editor (inbox KQ-T8): the
 * editor has no check of which branch it is on, and this repo's guards do.
 *
 * Usage (from the repo root of the main checkout, whose `.env.local` provides
 * `PROD_NEON_ENDPOINT`):
 *   pnpm --filter @opika/db auth:revoke-all --prod --expect ep-…            dry run: counts only
 *   pnpm --filter @opika/db auth:revoke-all --prod --expect ep-… --commit   deletes
 * A local target (tests, Docker) takes neither `--prod` nor `--expect`.
 *
 * Refuses, with nothing run, in this order:
 *   1. an argument it doesn't take (`--expect=ep-…`, `--comit`, a stray word),
 *      or `--expect` with no endpoint after it or given twice: the command line
 *      has to say exactly what it means. A refusal echoes a flag's spelling, never
 *      anything that could be a pasted URL;
 *   2. production without `--prod` (`assertProductionWriteAllowed`, which fails
 *      closed when `PROD_NEON_ENDPOINT` is unknown);
 *   3. a non-local target whose Neon compute isn't exactly `--expect`, or
 *      `--expect` given for a local target (`migrateTargetCheck`, the same
 *      check `db:migrate` runs, AW-F1).
 * Only then does it print the target line (`databaseTargetLine`: endpoint and
 * host, never the URL), so a refused run prints nothing but its refusal.
 *
 * Driver: `createDatabase`, so on Neon this runs over neon-http, the driver
 * the deployed app uses and the one the Neon smoke's step 37 runs this same
 * repository call through. The deletion is one statement, so it needs no
 * interactive transaction (neon-http has none). `demo:remove` takes
 * postgres-js only because its removal spans many statements.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./client";
import { EXPECT_FLAG, migrateTargetCheck } from "./migrate-args";
import { assertProductionWriteAllowed, databaseTargetLine, PROD_FLAG } from "./prod-guard";
import { type AuthRevokeCounts, authRevokeRepo } from "./repos/auth-revoke-repo";

export const COMMIT_FLAG = "--commit";

export type RevokeArgs =
  | { kind: "ok"; expect: string | undefined; commit: boolean }
  | { kind: "refused"; reason: string };

const ARGUMENTS_TAKEN = `${PROD_FLAG}, ${EXPECT_FLAG} <ep> and ${COMMIT_FLAG}`;
/** A flag's spelling is echoed in a refusal; anything else might be a pasted URL, so it never is. */
const FLAG_SPELLING = /^-{1,2}[A-Za-z][A-Za-z0-9-]*$/;

/**
 * Reads the arguments after the script path (`process.argv.slice(2)`). Whether
 * the `--expect` value is a valid endpoint id, and the right one, is
 * `migrateTargetCheck`'s job, not this one's.
 */
export function parseRevokeArgs(args: readonly string[]): RevokeArgs {
  let expect: string | undefined;
  let commit = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === PROD_FLAG) continue;
    if (arg === COMMIT_FLAG) {
      commit = true;
      continue;
    }
    if (arg === EXPECT_FLAG) {
      const value = args[i + 1];
      if (value === undefined || value === "" || value.startsWith("-")) {
        return { kind: "refused", reason: `${EXPECT_FLAG} needs an endpoint id (ep-…) after it` };
      }
      if (expect !== undefined) return { kind: "refused", reason: `${EXPECT_FLAG} is given twice` };
      expect = value;
      i++;
      continue;
    }
    if (arg.startsWith(`${EXPECT_FLAG}=`)) {
      return { kind: "refused", reason: `write ${EXPECT_FLAG} <ep>, not ${EXPECT_FLAG}=<ep>` };
    }
    const what = FLAG_SPELLING.test(arg)
      ? `${arg} is not an argument this script takes`
      : `argument ${i + 1} is not one this script takes`;
    return { kind: "refused", reason: `${what}; it takes ${ARGUMENTS_TAKEN}` };
  }
  return { kind: "ok", expect, commit };
}

const countLines = (counts: AuthRevokeCounts): string[] => [
  `  ${"auth_session".padEnd(19)}${counts.sessions}`,
  `  ${"auth_verification".padEnd(19)}${counts.verifications}`,
];

/** What a dry run prints after the target line. */
export function dryRunLines(counts: AuthRevokeCounts): string[] {
  return [
    "DRY RUN (nothing is deleted)",
    "Rows now:",
    ...countLines(counts),
    `Nothing was deleted. Re-run with ${COMMIT_FLAG} to delete every row of these two tables.`,
  ];
}

/** What a committed run prints after the target line. */
export function committedLines(deleted: AuthRevokeCounts): string[] {
  return [
    "COMMIT",
    "Deleted, in one statement:",
    ...countLines(deleted),
    "Done. Run the dry run again: both counts should be 0.",
  ];
}

/**
 * An error's message and its causes' messages (Drizzle wraps the driver's
 * error as `cause`, so the message alone names only the query). Messages
 * only, not the error objects, whose other properties this script hasn't
 * vetted for what they carry.
 */
export function messagesOf(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && messages.length < 5) {
    messages.push(current.message.trim());
    current = current.cause;
  }
  return messages.length > 0 ? messages : ["the query failed"];
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  const args = parseRevokeArgs(process.argv.slice(2));
  if (args.kind === "refused") {
    console.error(`REFUSED: ${args.reason}. Nothing was run.`);
    process.exit(1);
  }
  assertProductionWriteAllowed(url, process.argv, process.env, args.commit ? "write" : "read");
  const target = migrateTargetCheck(url, args.expect);
  if (target.kind === "refused") {
    console.error(`REFUSED: ${target.reason}. Nothing was run (not printing the URL).`);
    process.exit(1);
  }
  console.log(databaseTargetLine(url));

  const repo = authRevokeRepo(createDatabase(url));
  let exitCode: 0 | 1 = 0;
  try {
    const lines = args.commit
      ? committedLines(await repo.deleteAll())
      : dryRunLines(await repo.countAll());
    for (const line of lines) console.log(line);
  } catch (error) {
    console.error(`ERROR: ${messagesOf(error).join(" | caused by: ")}`);
    exitCode = 1;
  }
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
