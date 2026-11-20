import { kabinetDb } from "../../../../kabinet/kabinet-db";
import { handleNotificationsCron } from "../../../../kabinet/notifications-cron";
import { notifyDepsOf, notifyRuntimeOf } from "../../../../kabinet/notify/runtime";

/**
 * Mails go out 500 ms apart, each up to its 10 s timeout, so the budget (`DAILY_SEND_BUDGET`, 300)
 * can outlast the route: the run stops claiming after 240 s (`DAILY_TIME_GUARD_MS`) and an
 * unclaimed mail waits for the next run.
 */
export const maxDuration = 300;

/**
 * Vercel's cron (`apps/web/vercel.json`, `crons`, daily) calls this with GET and
 * `Authorization: Bearer <CRON_SECRET>`. Everything it does is in `handleNotificationsCron`,
 * which the tests call with a real `Request`.
 */
export async function GET(request: Request): Promise<Response> {
  return handleNotificationsCron(request, {
    cronSecret: process.env.CRON_SECRET,
    notify: () => {
      const runtime = notifyRuntimeOf(process.env);
      return runtime.kind === "on" ? notifyDepsOf(runtime, kabinetDb()) : null;
    },
    healthcheckUrl: process.env.HEALTHCHECK_URL_NOTIFICATIONS,
    // biome-ignore lint/suspicious/noConsole: the counts-only line is the cron's log
    log: (line) => console.info(line),
  });
}
