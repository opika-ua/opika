import { kabinetDb } from "../../../../kabinet/kabinet-db";
import { handleR2CleanupCron } from "../../../../kabinet/r2-cleanup-cron";
import { r2CleanupStateOf } from "../../../../kabinet/r2-cleanup-env";

/**
 * Vercel's cron (`apps/web/vercel.json`, `crons`, daily) calls this with GET
 * and `Authorization: Bearer <CRON_SECRET>`. GDPR photo retention
 * (`docs/gdpr-analysis.md`) - everything it does is in `handleR2CleanupCron`,
 * which the tests call with a real `Request`.
 */
export async function GET(request: Request): Promise<Response> {
  return handleR2CleanupCron(request, {
    cronSecret: process.env.CRON_SECRET,
    db: kabinetDb,
    now: new Date(),
    healthcheckUrl: process.env.HEALTHCHECK_URL_R2_CLEANUP,
    r2State: r2CleanupStateOf(process.env),
    log: (line) => console.info(line),
    // biome-ignore lint/suspicious/noConsole: the cap trip must reach the error log
    logError: (line) => console.error(line),
  });
}
