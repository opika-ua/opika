import { handleAuthCleanup } from "../../../../kabinet/auth-cleanup";
import { kabinetDb } from "../../../../kabinet/kabinet-db";

/**
 * Vercel's cron (`apps/web/vercel.json`, `crons`, every 6 hours) calls this
 * with GET and `Authorization: Bearer <CRON_SECRET>`. Everything it does is in
 * `handleAuthCleanup`, which the tests call with a real `Request`.
 */
export async function GET(request: Request): Promise<Response> {
  return handleAuthCleanup(request, {
    cronSecret: process.env.CRON_SECRET,
    db: kabinetDb,
    now: new Date(),
    log: (line) => console.info(line),
  });
}
