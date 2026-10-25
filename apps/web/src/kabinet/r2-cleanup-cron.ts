import { createHash, timingSafeEqual } from "node:crypto";
import type { Database } from "@opika/db";

/**
 * GDPR photo retention (`docs/gdpr-analysis.md`). The scheduled half of the
 * R2 clean-up job — `packages/db/src/r2-cleanup.ts`'s own doc comment covers
 * the orchestration and the CLI's manual half (dry run, `--commit`,
 * `--grace-days`). This route always commits, at the default grace period
 * (`R2_CLEANUP_GRACE_PERIOD_DAYS`) — it never reads a grace-days override
 * from anywhere, which is what makes it the half Oleksii's "refused by the
 * scheduled job" describes: there is no input on this path to refuse, by
 * construction, not by a check.
 *
 * - **Who may call it:** Vercel's cron, the same `Authorization: Bearer
 *   <CRON_SECRET>` shape as `auth-cleanup.ts` (constant-time, SHA-256
 *   digests). No secret, or an empty one, refuses every call — fail closed.
 * - **R2 credentials:** this job's own (`R2_CLEANUP_ACCESS_KEY_ID`/
 *   `R2_CLEANUP_SECRET_ACCESS_KEY`), never the upload token or the
 *   onboarding script's — `r2-cleanup-client.ts`'s own doc comment. Missing
 *   or incomplete credentials refuse the run (500) rather than skip R2 and
 *   silently do nothing.
 * - **What it logs:** counts only, never an object key, a storage key or an
 *   animal id — the same discipline as `auth-cleanup.ts`'s "log counts
 *   only, never addresses."
 */
export type R2CleanupCronConfig = {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export async function handleR2CleanupCron(
  request: Request,
  deps: {
    cronSecret: string | undefined;
    db: () => Database;
    now: Date;
    r2: R2CleanupCronConfig | undefined;
    log: (line: string) => void;
  },
): Promise<Response> {
  if (!deps.cronSecret) {
    deps.log(JSON.stringify({ event: "r2_cleanup", outcome: "refused_no_secret" }));
    return new Response("Cron secret not configured", { status: 500 });
  }
  if (!bearerMatches(request.headers.get("authorization"), deps.cronSecret)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!deps.r2) {
    deps.log(JSON.stringify({ event: "r2_cleanup", outcome: "refused_no_r2_config" }));
    return new Response("R2 clean-up credentials not configured", { status: 500 });
  }

  const pipeline = await import("@opika/db/image-pipeline/server");
  const r2 = pipeline.createR2CleanupClient(deps.r2);
  const report = await pipeline.runR2Cleanup(deps.db(), r2, deps.now, {
    commit: true,
    graceDays: undefined,
  });

  deps.log(
    JSON.stringify({
      event: "r2_cleanup",
      outcome: "ran",
      scanned: report.scanned,
      newlyTracked: report.newlyTracked,
      clearedBack: report.clearedBack,
      dueForDeletion: report.dueForDeletion.length,
      deleted: report.deleted.length,
      failed: report.failed.length,
      snapshotsNulled: report.snapshotsNulled,
    }),
  );
  return Response.json({
    scanned: report.scanned,
    newlyTracked: report.newlyTracked,
    clearedBack: report.clearedBack,
    dueForDeletion: report.dueForDeletion.length,
    deleted: report.deleted.length,
    failed: report.failed.length,
    snapshotsNulled: report.snapshotsNulled,
  });
}

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

function bearerMatches(header: string | null, secret: string): boolean {
  if (header === null) return false;
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
