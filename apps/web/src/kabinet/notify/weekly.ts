import { createHash } from "node:crypto";
import { notificationRecipientsRepo, notificationSendsRepo } from "@opika/db/repos";
import { DAILY_TIME_GUARD_MS } from "./daily";
import { kyivIsoWeekOf } from "./day";
import { dedupKeyOf } from "./dedup";
import { createPacer, deliver, type NotifyDeps, openEventCap } from "./deliver";
import { planFreshnessReminder } from "./intents";

/**
 * Mails the weekly run may send. Below the daily 20 plus the event cap's 40: a Monday run shares
 * the day's cap and leaves the provider's 100 a day room for sign-in.
 */
export const WEEKLY_SEND_BUDGET = 30;

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

/** A hash order that changes with the week, so a budget that cannot reach everyone does not always skip the same shelters. */
const rotation = (week: string, shelterId: string): string =>
  createHash("sha256").update(`${week}:${shelterId}`).digest("hex");

/**
 * The weekly «непідтверджені картки» mail (F1) to every admin of each shelter that has visible
 * cards nobody confirmed for 14 days. One grouped query finds the shelters and one the admins;
 * the claim key `fr:{shelterId}:{week}:{userHash}` makes a duplicate cron event or a manual
 * re-run send nothing new. Sends one at a time, spaced, under the budget, the time guard and the
 * day's event cap; what is not reached waits for next Monday.
 */
export async function runWeeklyReminders(
  deps: NotifyDeps,
  budget: number = WEEKLY_SEND_BUDGET,
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
  const due = (await recipients.freshnessReminderDue(now)).sort((a, b) =>
    rotation(week, a.shelterId).localeCompare(rotation(week, b.shelterId)),
  );
  counts.shelters = due.length;
  if (due.length === 0) return counts;
  const admins = await recipients.shelterAdminsOf(due.map((shelter) => shelter.shelterId));
  const alreadyClaimed = await notificationSendsRepo(deps.db).claimedKeys(
    admins.map((admin) => dedupKeyOf(`fr:${admin.shelterId}:${week}`, admin.userId)),
  );
  const pacer = createPacer(deps);
  const cap = await openEventCap(deps);
  const startedAt = now.getTime();
  let left = budget;

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
      if (left <= 0 || counts.stoppedForTime) {
        counts.deferred += 1;
        continue;
      }
      try {
        if (!cap.take()) {
          counts.skippedOverCap += 1;
          continue;
        }
        left -= 1;
        const result = await deliver(deps, pacer, intent, recipient);
        if (result === "duplicate") {
          left += 1;
          cap.refund();
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
