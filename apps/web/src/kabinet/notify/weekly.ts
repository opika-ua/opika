import { notificationRecipientsRepo, notificationSendsRepo } from "@opika/db/repos";
import { DAILY_SEND_BUDGET, DAILY_TIME_GUARD_MS } from "./daily";
import { kyivIsoWeekOf } from "./day";
import { dedupKeyOf } from "./dedup";
import {
  createPacer,
  deliver,
  type NotifyDeps,
  openEventCap,
  remainingBatchBudget,
} from "./deliver";
import { planFreshnessReminder } from "./intents";

export type WeeklyCounts = {
  /** Shelters with unconfirmed cards that are listed and not switched off. */
  shelters: number;
  /** Of those, shelters with no admin who has accepted an invitation: nobody to mail. */
  withoutAdmins: number;
  sent: number;
  failed: number;
  duplicates: number;
  /** Mails left unclaimed because the budget or the time guard ran out. */
  deferred: number;
  skippedOverCap: number;
  errors: number;
  stoppedForTime: boolean;
};

/**
 * The weekly «непідтверджені картки» mail (F1) to every admin of each shelter that has visible
 * cards nobody confirmed for 14 days. One grouped query finds the shelters and one the admins;
 * the claim key `fr:{shelterId}:{week}:{userHash}` makes a duplicate cron event or a manual
 * re-run send nothing new. Sends one at a time, spaced, under the day's one batch budget (shared
 * with the daily cron, `remainingBatchBudget`), the time guard and the event cap; what is not
 * reached waits for next Monday, first in line then.
 */
export async function runWeeklyReminders(
  deps: NotifyDeps,
  budget: number = DAILY_SEND_BUDGET,
): Promise<WeeklyCounts> {
  const now = deps.now();
  const week = kyivIsoWeekOf(now);
  const recipients = notificationRecipientsRepo(deps.db);
  const counts: WeeklyCounts = {
    shelters: 0,
    withoutAdmins: 0,
    sent: 0,
    failed: 0,
    duplicates: 0,
    deferred: 0,
    skippedOverCap: 0,
    errors: 0,
    stoppedForTime: false,
  };
  const stale = await recipients.freshnessReminderDue(now);
  // Longest-waiting first: a shelter the budget skipped has an older (or no) last mail than the
  // ones it served, so next week it leads. A mail that was not sent has no row to say otherwise.
  const lastSent = await notificationSendsRepo(deps.db).lastSentAtByShelter(
    "freshnessReminder",
    stale.map((shelter) => shelter.shelterId),
  );
  const due = [...stale].sort(
    (a, b) =>
      (lastSent.get(a.shelterId)?.getTime() ?? 0) - (lastSent.get(b.shelterId)?.getTime() ?? 0) ||
      a.shelterId.localeCompare(b.shelterId),
  );
  counts.shelters = due.length;
  if (due.length === 0) return counts;
  const admins = await recipients.shelterAdminsOf(due.map((shelter) => shelter.shelterId));
  const alreadyClaimed = await notificationSendsRepo(deps.db).claimedKeys(
    admins.map((admin) => dedupKeyOf(`fr:${admin.shelterId}:${week}`, admin.userId)),
  );
  const pacer = createPacer(deps);
  const cap = openEventCap(deps);
  const startedAt = now.getTime();

  for (const shelter of due) {
    const to = admins.filter((admin) => admin.shelterId === shelter.shelterId);
    if (to.length === 0) {
      counts.withoutAdmins += 1;
      continue;
    }
    const intent = planFreshnessReminder(shelter, week);
    for (const recipient of to) {
      if (alreadyClaimed.has(dedupKeyOf(intent.dedupBase, recipient.userId))) {
        counts.duplicates += 1;
        continue;
      }
      if (deps.now().getTime() - startedAt > DAILY_TIME_GUARD_MS) counts.stoppedForTime = true;
      if (counts.stoppedForTime || (await remainingBatchBudget(deps, budget)) <= 0) {
        counts.deferred += 1;
        continue;
      }
      try {
        if (!(await cap.take())) {
          counts.skippedOverCap += 1;
          continue;
        }
        const result = await deliver(deps, pacer, intent, recipient);
        if (result === "duplicate") {
          counts.duplicates += 1;
        } else if (result === "sent") counts.sent += 1;
        else counts.failed += 1;
      } catch {
        counts.errors += 1;
      }
    }
  }
  return counts;
}
