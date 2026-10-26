/**
 * `r2:cleanup`: GDPR photo retention (`docs/gdpr-analysis.md`). Deletes R2
 * photo objects that have sat unreferenced (no `animals.photos` row names
 * their storage key) for at least the grace period — `r2-cleanup-repo.ts`'s
 * own doc comments cover the reference rule and the tracking table,
 * `r2-cleanup-run.ts` the orchestration this CLI and the scheduled job both
 * share. This file is the CLI only — `r2-cleanup-run.ts` has no `prod-guard`
 * import, so `image-pipeline/server.ts` (which `apps/web`'s cron route
 * dynamically imports) re-exports from there, never from here; this file's
 * own `main()` is the one place `prod-guard`'s CLI-only guard belongs.
 *
 * Two callers, two trust boundaries:
 *   - **The scheduled job** (`apps/web`'s `/api/cron/r2-cleanup`, Vercel
 *     cron, daily): calls `runR2Cleanup(db, r2, now, { commit: true })`
 *     directly, no CLI, no `--grace-days` — the default grace period is the
 *     only one it ever uses. Its own file is the trust boundary (Vercel's
 *     `CRON_SECRET`), the same shape as `auth-cleanup.ts`.
 *   - **This CLI**, for an operator's own machine: dry run by default (DR-B1's
 *     convention, `demo:remove`/`db:full-reset`'s own shape), `--commit` to
 *     actually delete, and the one place `--grace-days` can be overridden —
 *     his R2-B1 words, verbatim: "The post-reset run: design the one-off
 *     clean-up after the full reset: --grace-days 0 allowed only in a
 *     manual run with --commit and the typed --expect, refused by the
 *     scheduled job." So `--grace-days` requires `--commit`, by his own
 *     words — a Tier 1 delta review asked whether a read-only preview
 *     (without `--commit`) should be allowed too; that's an open question
 *     for him, not something this file decides on its own (`docs/decisions-
 *     inbox/feat-r2-photo-cleanup.md`, R2-F4). `--expect` is required
 *     unconditionally either way (this script only ever targets production
 *     — there is nothing to clean up locally, the same reasoning as
 *     `demo:remove`).
 *
 * Usage (from the repo root; `PROD_NEON_ENDPOINT` from the shell or the root
 * `.env.local`, as for every production-aware script):
 *   pnpm --filter @opika/db r2:cleanup --expect ep-…                 dry run
 *   pnpm --filter @opika/db r2:cleanup --expect ep-… --commit        deletes
 *   … --prod                                                           when the target is production
 *   … --grace-days 0 --commit                                          the post-reset one-off, for real
 *
 * R2 credentials are this job's own (`R2_CLEANUP_ACCESS_KEY_ID`/
 * `R2_CLEANUP_SECRET_ACCESS_KEY`), never the upload token
 * (`R2_UPLOAD_*`) or the onboarding script's (`R2_ACCESS_KEY_ID`/
 * `R2_SECRET_ACCESS_KEY`) — `r2-cleanup-client.ts`'s own doc comment.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { createDatabaseWithClient } from "./client";
import { createR2CleanupClient } from "./image-pipeline/r2-cleanup-client";
import {
  assertProductionWriteAllowed,
  databaseTargetLine,
  expectedTargetOf,
  PROD_FLAG,
} from "./prod-guard";
import { formatReport, runR2Cleanup } from "./r2-cleanup-run";

export {
  ANIMAL_PHOTO_PREFIX,
  formatReport,
  type R2CleanupReport,
  runR2Cleanup,
} from "./r2-cleanup-run";

export type CleanupArgs =
  | { kind: "ok"; commit: boolean; graceDays: number | undefined }
  | { kind: "refused"; reason: string };

const ARGUMENTS_TAKEN = "--expect <ep>, --commit, --prod and --grace-days <n>";
const FLAG_SPELLING = /^-{1,2}[A-Za-z][A-Za-z0-9-]*$/;

/**
 * Reads the whole command line (`process.argv`). `--expect` is validated by
 * `expectedTargetOf` in `main`, not here — this only tracks that it was
 * given once, with a value, the same split `demo:remove` uses. A non-default
 * `--grace-days` needs `--commit`: his R2-B1 words, verbatim, "--grace-days
 * 0 allowed only in a manual run with --commit and the typed --expect" (and,
 * since `--expect` is required unconditionally in `main` regardless of
 * `--grace-days`, "and the typed --expect" falls out of that rather than
 * needing its own check here). A Tier 1 delta review asked whether a
 * read-only preview without `--commit` should be allowed too — an open
 * question for him (`docs/decisions-inbox/feat-r2-photo-cleanup.md`,
 * R2-F4), not decided here either way.
 */
export function parseCleanupArgs(argv: readonly string[]): CleanupArgs {
  const args = argv.slice(2);
  let commit = false;
  let graceDays: number | undefined;
  let expectSeen = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--commit") {
      commit = true;
      continue;
    }
    if (arg === PROD_FLAG) continue;
    if (arg === "--expect") {
      const value = args[i + 1];
      if (value === undefined || value.startsWith("-")) {
        return { kind: "refused", reason: "--expect needs an endpoint id after it" };
      }
      if (expectSeen) return { kind: "refused", reason: "--expect is given twice" };
      expectSeen = true;
      i++;
      continue;
    }
    if (arg === "--grace-days") {
      const value = args[i + 1];
      // `Number("")` and `Number(" ")` are both 0 — the most destructive
      // value this flag takes — so an empty or whitespace-only value must
      // be refused explicitly, never silently read as 0 (Tier 1 review,
      // PR #200, note 10).
      const trimmed = value?.trim();
      const n = trimmed === undefined || trimmed === "" ? Number.NaN : Number(trimmed);
      if (!Number.isInteger(n) || n < 0) {
        return {
          kind: "refused",
          reason: "--grace-days needs a non-negative whole number after it",
        };
      }
      if (graceDays !== undefined)
        return { kind: "refused", reason: "--grace-days is given twice" };
      graceDays = n;
      i++;
      continue;
    }
    const what = FLAG_SPELLING.test(arg)
      ? `${arg} is not an argument this script takes`
      : `argument ${i + 1} is not one this script takes`;
    return { kind: "refused", reason: `${what}; it takes ${ARGUMENTS_TAKEN}` };
  }
  if (graceDays !== undefined && !commit) {
    return {
      kind: "refused",
      reason:
        "--grace-days needs --commit (a non-default grace period is honoured only on a real run)",
    };
  }
  return { kind: "ok", commit, graceDays };
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
  const args = parseCleanupArgs(process.argv);
  if (args.kind === "refused") {
    console.error(`REFUSED: ${args.reason}. Nothing was run.`);
    process.exit(1);
  }
  assertProductionWriteAllowed(url, process.argv, process.env, args.commit ? "write" : "read");
  console.log(databaseTargetLine(url));

  const r2AccountId = process.env.R2_ACCOUNT_ID;
  const r2BucketName = process.env.R2_BUCKET_NAME;
  const r2AccessKeyId = process.env.R2_CLEANUP_ACCESS_KEY_ID;
  const r2SecretAccessKey = process.env.R2_CLEANUP_SECRET_ACCESS_KEY;
  for (const [name, value] of [
    ["R2_ACCOUNT_ID", r2AccountId],
    ["R2_BUCKET_NAME", r2BucketName],
    ["R2_CLEANUP_ACCESS_KEY_ID", r2AccessKeyId],
    ["R2_CLEANUP_SECRET_ACCESS_KEY", r2SecretAccessKey],
  ] as const) {
    if (!value) {
      console.error(`ERROR: ${name} is not set.`);
      process.exit(1);
    }
  }
  const r2 = createR2CleanupClient({
    accountId: r2AccountId as string,
    bucketName: r2BucketName as string,
    accessKeyId: r2AccessKeyId as string,
    secretAccessKey: r2SecretAccessKey as string,
  });

  const client = postgres(url, { max: 1 });
  const db = createDatabaseWithClient(client);
  let exitCode: 0 | 1 = 0;
  try {
    console.log(args.commit ? "COMMIT" : "DRY RUN (scanned and recorded; nothing deleted)");
    const report = await runR2Cleanup(db, r2, new Date(), {
      commit: args.commit,
      graceDays: args.graceDays,
    });
    for (const line of formatReport(report, args.commit ? "Deleted" : "Would delete")) {
      console.log(line);
    }
    if (report.failed.length > 0) exitCode = 1;
    if (!args.commit && report.dueForDeletion.length > 0) {
      console.log("Dry run only. Re-run with --commit to delete.");
    }
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    await client.end();
  }
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
