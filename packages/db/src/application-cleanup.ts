/**
 * `applications:cleanup`: the manual half of the daily application clean-up (D8, §14 Q4), and
 * the owner's production dry run before the scheduled route is switched on
 * (`APPLICATION_CLEANUP_ENABLED`). `application-cleanup-run.ts` has the selection and the
 * deletion; this file is the CLI and its guards.
 *
 * Usage (from the repo root; `PROD_NEON_ENDPOINT` from the shell or the root `.env.local`):
 *   pnpm --filter @opika/db applications:cleanup --dry-run                        local
 *   pnpm --filter @opika/db applications:cleanup --dry-run --prod --expect ep-…   prints ids and reasons
 *   pnpm --filter @opika/db applications:cleanup --commit --prod --expect ep-…    deletes them
 *
 * Exactly one of `--dry-run` and `--commit`: a run that forgot both never deletes by default.
 * Any non-local target needs `--expect ep-…` (that exact Neon compute), production `--prod`.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { formatApplicationCleanupReport, runApplicationCleanup } from "./application-cleanup-run";
import { createDatabaseWithClient } from "./client";
import {
  assertProductionWriteAllowed,
  databaseTargetLine,
  databaseTargetOf,
  expectedTargetOf,
  PROD_FLAG,
} from "./prod-guard";

export type ApplicationCleanupArgs =
  | { kind: "ok"; commit: boolean; endpoint: string | undefined }
  | { kind: "refused"; reason: string };

const TAKES = "it takes --dry-run or --commit, --prod and --expect ep-…";

export function parseApplicationCleanupArgs(argv: readonly string[]): ApplicationCleanupArgs {
  const args = argv.slice(2);
  let mode: "dry_run" | "commit" | undefined;
  let endpoint: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--dry-run" || arg === "--commit") {
      const next = arg === "--commit" ? "commit" : "dry_run";
      if (mode !== undefined) return { kind: "refused", reason: "give --dry-run or --commit once" };
      mode = next;
      continue;
    }
    if (arg === PROD_FLAG) continue;
    if (arg === "--expect") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "refused", reason: "--expect needs an endpoint id after it" };
      }
      if (endpoint !== undefined) return { kind: "refused", reason: "--expect is given twice" };
      endpoint = value;
      i++;
      continue;
    }
    return { kind: "refused", reason: `argument ${i + 1} is not one this script takes; ${TAKES}` };
  }
  if (mode === undefined) return { kind: "refused", reason: `nothing to do; ${TAKES}` };
  return { kind: "ok", commit: mode === "commit", endpoint };
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
  const args = parseApplicationCleanupArgs(process.argv);
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
    out(args.commit ? "COMMIT" : "DRY RUN (nothing deleted)");
    const report = await runApplicationCleanup(db, new Date(), { commit: args.commit });
    for (const line of formatApplicationCleanupReport(report, args.commit)) out(line);
    if (report.failed.length > 0) exitCode = 1;
  } catch (error) {
    err(error);
    exitCode = 1;
  } finally {
    await client.end();
  }
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
