import { handleFreshnessReminderCron } from "../../../../kabinet/freshness-reminder-cron";
import { kabinetDb } from "../../../../kabinet/kabinet-db";
import { notifyDepsOf, notifyRuntimeOf } from "../../../../kabinet/notify/runtime";

/** At most 20 sends in all (the budget it shares with the daily cron) 500 ms apart plus the provider's answer: well inside this, and the run also stops claiming after 240 s. */
export const maxDuration = 300;

/**
 * Vercel's cron (`apps/web/vercel.json`, `crons`, Mondays) calls this with GET and
 * `Authorization: Bearer <CRON_SECRET>`. Everything it does is in `handleFreshnessReminderCron`,
 * which the tests call with a real `Request`.
 */
export async function GET(request: Request): Promise<Response> {
  return handleFreshnessReminderCron(request, {
    cronSecret: process.env.CRON_SECRET,
    notify: () => {
      const runtime = notifyRuntimeOf(process.env);
      return runtime.kind === "on" ? notifyDepsOf(runtime, kabinetDb()) : null;
    },
    healthcheckUrl: process.env.HEALTHCHECK_URL_FRESHNESS_REMINDER,
    // biome-ignore lint/suspicious/noConsole: the counts-only line is the cron's log
    log: (line) => console.info(line),
  });
}
