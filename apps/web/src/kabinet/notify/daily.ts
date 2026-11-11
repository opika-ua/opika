import {
  kabinetShelterRepo,
  type NotificationSendRow,
  notificationRecipientsRepo,
  notificationSendsRepo,
  shelterRepo,
} from "@opika/db/repos";
import { kyivCalendarDateOf } from "@opika/domain";
import { dedupKeyOf } from "./dedup";
import { createPacer, deliver, type NotifyDeps, openEventCap, sendClaimed } from "./deliver";
import {
  type NotificationIntent,
  planEarlyListingEnding,
  planEventIntents,
  rebuildDailyIntent,
} from "./intents";

/**
 * Mails one run may send, retries and O4 together. Resend's free plan allows 100 a day and a
 * sign-in link must always have room: the event cap (40) plus this is a worst case of 60, which
 * leaves 40. Retries are not counted against the cap (owner to decide, `docs/runbook.md` 10).
 */
export const DAILY_SEND_BUDGET = 20;

/**
 * A run stops claiming after this long (Vercel gives the route 300 s): a send can take its 10 s
 * timeout, and what is left stays unclaimed for tomorrow's run.
 */
export const DAILY_TIME_GUARD_MS = 240_000;

export type DailyCounts = {
  retried: number;
  retrySent: number;
  retryDropped: number;
  endingSent: number;
  failed: number;
  duplicates: number;
  /** Mails left for the next run because the budget ran out. */
  deferred: number;
  errors: number;
  /** O4 mails left unsent because the day's event cap was already reached. */
  skippedOverCap: number;
  /** True when the run stopped claiming because `DAILY_TIME_GUARD_MS` had passed. */
  stoppedForTime: boolean;
};

/** The mail a failed row stood for, rebuilt from current state, or null when it no longer applies. */
async function rebuilt(
  deps: NotifyDeps,
  row: NotificationSendRow,
  now: Date,
): Promise<{ intent: NotificationIntent; recipient: { userId: string; email: string } } | null> {
  if (row.recipientUserId === null) return null;
  const recipients = notificationRecipientsRepo(deps.db);
  const recipient = await recipients.userById(row.recipientUserId);
  if (recipient === null) return null;
  const intents: NotificationIntent[] = [];
  if (row.dedupKey.startsWith("h:")) {
    const historyId = row.dedupKey.split(":")[1] ?? "";
    const line = await recipients.historyEntry(historyId);
    const shelter = line === null ? null : await shelterRepo(deps.db).findById(line.shelterId);
    if (line !== null && shelter !== null) {
      intents.push(...planEventIntents(shelter, [{ id: historyId, entry: line.entry }]));
    }
  } else if (
    (row.dedupKey.startsWith("rr:") || row.dedupKey.startsWith("dp:")) &&
    row.shelterId !== null
  ) {
    const [prefix, , day] = row.dedupKey.split(":");
    const shelter = await shelterRepo(deps.db).findById(row.shelterId);
    // The key must name a day this row was claimed on (the claim can land just after Kyiv midnight
    // of the line's day); its shelter is checked by the final key match below.
    const claimedOn = [row.createdAt, new Date(row.createdAt.getTime() - 600_000)].map(
      kyivCalendarDateOf,
    );
    if (
      shelter !== null &&
      (prefix === "rr" || prefix === "dp") &&
      day !== undefined &&
      (claimedOn as string[]).includes(day)
    ) {
      const intent = rebuildDailyIntent(shelter, prefix, day);
      if (intent !== null) intents.push(intent);
    }
  } else if (row.dedupKey.startsWith("el-end:") && row.shelterId !== null) {
    const shelter = await shelterRepo(deps.db).findById(row.shelterId);
    if (shelter !== null) {
      const periodsUsed = await kabinetShelterRepo(deps.db).earlyListingPeriodsUsed(shelter.id);
      const intent = planEarlyListingEnding(shelter, periodsUsed, now);
      if (intent !== null) intents.push(intent);
    }
  }
  const intent = intents.find((i) => dedupKeyOf(i.dedupBase, recipient.userId) === row.dedupKey);
  if (intent === undefined) return null;
  // Whoever lost the role since the first try is not mailed on the retry.
  const audience =
    intent.audience === "operators"
      ? await recipients.operators()
      : await recipients.shelterAdmins(intent.shelterId);
  return audience.some((member) => member.userId === recipient.userId)
    ? { intent, recipient }
    : null;
}

/**
 * The daily batch: first one retry of mails that failed in the last 48 hours, then O4 (early
 * listing ends within 7 days) once per period. Sends one at a time, spaced, and stops at the
 * budget; a mail past it is not claimed, so the next run finds it still due.
 */
export async function runDailyNotifications(
  deps: NotifyDeps,
  budget: number = DAILY_SEND_BUDGET,
): Promise<DailyCounts> {
  const now = deps.now();
  const pacer = createPacer(deps);
  const sends = notificationSendsRepo(deps.db);
  const counts: DailyCounts = {
    retried: 0,
    retrySent: 0,
    retryDropped: 0,
    endingSent: 0,
    failed: 0,
    duplicates: 0,
    deferred: 0,
    errors: 0,
    skippedOverCap: 0,
    stoppedForTime: false,
  };
  let left = budget;
  const startedAt = now.getTime();
  const outOfTime = () => {
    if (deps.now().getTime() - startedAt > DAILY_TIME_GUARD_MS) counts.stoppedForTime = true;
    return counts.stoppedForTime;
  };

  for (const row of await sends.retryable(now)) {
    if (left <= 0 || outOfTime()) {
      counts.deferred += 1;
      continue;
    }
    try {
      // The attempt is counted before the send, and of two racing runs only one wins the row.
      if (!(await sends.reclaim(now, row.dedupKey))) continue;
      counts.retried += 1;
      const mail = await rebuilt(deps, row, now);
      if (mail === null) {
        await sends.mark(deps.now(), row.dedupKey, "failed");
        counts.retryDropped += 1;
        continue;
      }
      left -= 1;
      const status = await sendClaimed(deps, pacer, mail.intent, mail.recipient, row.dedupKey);
      if (status === "sent") counts.retrySent += 1;
      else counts.failed += 1;
    } catch {
      counts.errors += 1;
    }
  }

  const recipients = notificationRecipientsRepo(deps.db);
  const due: NotificationIntent[] = [];
  for (const shelter of await recipients.earlyListingRunning(now)) {
    if (planEarlyListingEnding(shelter, 1, now) === null) continue;
    const periodsUsed = await kabinetShelterRepo(deps.db).earlyListingPeriodsUsed(shelter.id);
    const intent = planEarlyListingEnding(shelter, periodsUsed, now);
    if (intent !== null) due.push(intent);
  }
  const operators = due.length === 0 ? [] : await recipients.operators();
  const cap = await openEventCap(deps);
  for (const intent of due) {
    for (const operator of operators) {
      if (left <= 0 || outOfTime()) {
        counts.deferred += 1;
        continue;
      }
      try {
        if (!cap.take()) {
          counts.skippedOverCap += 1;
          continue;
        }
        left -= 1;
        const result = await deliver(deps, pacer, intent, operator);
        if (result === "duplicate") {
          left += 1;
          cap.refund();
          counts.duplicates += 1;
        } else if (result === "sent") counts.endingSent += 1;
        else counts.failed += 1;
      } catch {
        counts.errors += 1;
      }
    }
  }
  return counts;
}
