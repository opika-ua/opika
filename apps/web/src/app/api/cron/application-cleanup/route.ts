import {
  applicationCleanupEnabled,
  handleApplicationCleanupCron,
} from "../../../../kabinet/application-cleanup-cron";
import { kabinetDb } from "../../../../kabinet/kabinet-db";

/**
 * Vercel's cron (`apps/web/vercel.json`, daily at 03:00 UTC, an hour before the R2 clean-up)
 * calls this with `Authorization: Bearer <CRON_SECRET>`. Off until `APPLICATION_CLEANUP_ENABLED`
 * is `on` (after the owner's production dry run); `handleApplicationCleanupCron` does the rest.
 */
export async function GET(request: Request): Promise<Response> {
  return handleApplicationCleanupCron(request, {
    cronSecret: process.env.CRON_SECRET,
    enabled: applicationCleanupEnabled(process.env),
    db: kabinetDb,
    now: new Date(),
    healthcheckUrl: process.env.HEALTHCHECK_URL_APPLICATION_CLEANUP,
    // biome-ignore lint/suspicious/noConsole: the run's counts go to the function log
    log: (line) => console.info(line),
    // biome-ignore lint/suspicious/noConsole: a failed deletion must reach the error log
    logError: (line) => console.error(line),
  });
}
