import { handleNotifyCron, type NotifyCronDeps } from "./notifications-cron";
import { runWeeklyReminders } from "./notify/weekly";

/**
 * The weekly freshness reminder (`apps/web/vercel.json`, Mondays 07:00 UTC, which is 09:00 in
 * Kyiv in winter and 10:00 in summer): F1, the mail naming a shelter's cards nobody has
 * confirmed for 14 days. The same door as the daily notifications cron (`handleNotifyCron`):
 * Vercel's bearer secret, fail closed, counts-only log, optional Healthchecks check-in
 * (`HEALTHCHECK_URL_FRESHNESS_REMINDER`).
 */
export const handleFreshnessReminderCron = (request: Request, deps: NotifyCronDeps) =>
  handleNotifyCron(request, deps, {
    event: "kabinet_freshness_reminder",
    run: (notify) => runWeeklyReminders(notify),
  });
