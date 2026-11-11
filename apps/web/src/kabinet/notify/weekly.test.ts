import { notificationSends, shelters } from "@opika/db/schema";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import { EARLY_LISTING_DAYS, type Shelter } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DAILY_SEND_BUDGET, runDailyNotifications } from "./daily";
import { DEFAULT_DAILY_EVENT_CAP } from "./runtime";
import {
  DAY,
  depsOf,
  fakeMail,
  NOW,
  PENDING,
  seedCard,
  seedOperator,
  seedShelter,
  VERIFIED,
} from "./test-utils/fixtures";
import { runWeeklyReminders } from "./weekly";

/** The weekly reminder against a real database; only the provider is fake. */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs);
const stale = (days = 20) => ({ kind: "published", confirmedAt: ago(days) }) as const;
const sentTo = (sent: { to: string }[]) => sent.map((email) => email.to).sort();
const verified = { verification: VERIFIED } as Partial<Shelter>;

async function listedShelter(admins = ["a@example.org"], overrides: Partial<Shelter> = verified) {
  const { shelter } = await seedShelter(db, { admins, overrides });
  return shelter;
}

describe("runWeeklyReminders: who is mailed and what it says", () => {
  it("mails every admin of a listed shelter once, naming the count, the shelter and 14 days", async () => {
    const shelter = await listedShelter(["a@example.org", "b@example.org"]);
    await seedCard(db, shelter, stale());
    const { mail, sent } = fakeMail();
    const counts = await runWeeklyReminders(depsOf(db, mail));
    expect(sentTo(sent)).toEqual(["a@example.org", "b@example.org"]);
    expect(counts).toMatchObject({ shelters: 1, sent: 2, duplicates: 0, withoutAdmins: 0 });
    const [email] = sent;
    expect(email?.subject).toBe("1 картка чекає на підтвердження");
    expect(email?.text).toContain(
      "1 картку притулку «Тестовий притулок» ви не підтверджували щонайменше 14 днів.",
    );
    expect(email?.text).toContain("https://example.org/kabinet/tvaryny");
    expect(email?.text).toContain("щопонеділка");
    expect(email?.text.trimEnd().endsWith("\nОлексій")).toBe(true);
  });

  it("counts visible cards only, and only those at least 14 days unconfirmed", async () => {
    const shelter = await listedShelter();
    await seedCard(db, shelter, stale(14));
    await seedCard(db, shelter, { kind: "reserved", confirmedAt: ago(30) });
    // Not named: confirmed 13 days and 23 hours ago, a draft, an adopted and a withdrawn card.
    await seedCard(db, shelter, { kind: "published", confirmedAt: ago(14, -3_600_000) });
    await seedCard(db, shelter, { kind: "draft" });
    await seedCard(db, shelter, { kind: "adopted" });
    await seedCard(db, shelter, { kind: "withdrawn" });
    const { mail, sent } = fakeMail();
    await runWeeklyReminders(depsOf(db, mail));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("2 картки чекають на підтвердження");
  });

  it("names nothing when every card is fresh", async () => {
    const shelter = await listedShelter();
    await seedCard(db, shelter, { kind: "published", confirmedAt: ago(1) });
    const { mail, sent } = fakeMail();
    const counts = await runWeeklyReminders(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(counts.shelters).toBe(0);
  });

  it("skips a shelter that is not publicly listed, or switched off", async () => {
    const pending = await listedShelter(["pending@example.org"], { verification: PENDING });
    const paused = await listedShelter(["paused@example.org"], {
      verification: { ...VERIFIED, status: "paused" } as never,
    });
    const suspended = await listedShelter(["suspended@example.org"], {
      verification: { ...VERIFIED, status: "suspended" } as never,
    });
    const off = await listedShelter(["off@example.org"], {
      verification: VERIFIED,
      freshnessReminderOffAt: ago(3),
    });
    const early = await listedShelter(["early@example.org"], {
      verification: PENDING,
      earlyListingSince: ago(10),
    });
    const expired = await listedShelter(["expired@example.org"], {
      verification: PENDING,
      earlyListingSince: ago(61),
    });
    for (const shelter of [pending, paused, suspended, off, early, expired]) {
      await seedCard(db, shelter, stale());
    }
    const { mail, sent } = fakeMail();
    await runWeeklyReminders(depsOf(db, mail));
    expect(sentTo(sent)).toEqual(["early@example.org"]);
  });

  it("counts a shelter with no admin who has joined, and mails nobody", async () => {
    const { shelter } = await seedShelter(db, { overrides: verified });
    await seedCard(db, shelter, stale());
    const { mail, sent } = fakeMail();
    const counts = await runWeeklyReminders(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(counts).toMatchObject({ shelters: 1, withoutAdmins: 1, sent: 0 });
  });

  it("never carries anything about the people looking for an animal", async () => {
    const shelter = await listedShelter();
    await seedCard(db, shelter, stale());
    const { mail, sent } = fakeMail();
    await runWeeklyReminders(depsOf(db, mail));
    const text = `${sent[0]?.subject} ${sent[0]?.text}`;
    for (const word of ["контакт", "переглян", "зверн", "шахрай"]) expect(text).not.toContain(word);
  });
});

describe("runWeeklyReminders: once a week, within the cap and the budget", () => {
  async function oneStaleShelter(admins = ["a@example.org"]) {
    const shelter = await listedShelter(admins);
    await seedCard(db, shelter, stale());
    return shelter;
  }

  it("a second run in the same ISO week sends nothing; the next week sends again", async () => {
    await oneStaleShelter();
    const { mail, sent } = fakeMail();
    await runWeeklyReminders(depsOf(db, mail));
    const again = await runWeeklyReminders(depsOf(db, mail));
    expect(sent).toHaveLength(1);
    expect(again).toMatchObject({ sent: 0, duplicates: 1 });
    const nextWeek = new Date(NOW.getTime() + 7 * DAY);
    await runWeeklyReminders(depsOf(db, mail, { now: nextWeek }));
    expect(sent).toHaveLength(2);
  });

  it("the week turns over at Kyiv midnight on Sunday, not UTC midnight", async () => {
    await oneStaleShelter();
    const { mail, sent } = fakeMail();
    // 21:30 UTC on Sunday 15 November is 23:30 in Kyiv, still week 46; 22:30 UTC is Monday, week 47.
    await runWeeklyReminders(depsOf(db, mail, { now: new Date("2026-11-15T21:30:00.000Z") }));
    await runWeeklyReminders(depsOf(db, mail, { now: new Date("2026-11-15T21:50:00.000Z") }));
    expect(sent).toHaveLength(1);
    await runWeeklyReminders(depsOf(db, mail, { now: new Date("2026-11-15T22:30:00.000Z") }));
    expect(sent).toHaveLength(2);
  });

  it("stops at the daily event cap: no handoff to the sender, and it is counted", async () => {
    await oneStaleShelter(["a@example.org", "b@example.org", "c@example.org"]);
    const { mail, sent } = fakeMail();
    const counts = await runWeeklyReminders(depsOf(db, mail, { eventCap: 2 }));
    expect(sent).toHaveLength(2);
    expect(counts).toMatchObject({ sent: 2, skippedOverCap: 1 });
  });

  it("stops at its own budget and leaves the rest unclaimed", async () => {
    await oneStaleShelter(["a@example.org", "b@example.org", "c@example.org"]);
    const { mail, sent } = fakeMail();
    const counts = await runWeeklyReminders(depsOf(db, mail), 2);
    expect(sent).toHaveLength(2);
    expect(counts).toMatchObject({ sent: 2, deferred: 1 });
    expect(await db.select().from(notificationSends)).toHaveLength(2);
  });

  it("spaces its sends by at least 500 ms", async () => {
    await oneStaleShelter(["a@example.org", "b@example.org"]);
    const { mail } = fakeMail();
    const deps = depsOf(db, mail);
    await runWeeklyReminders(deps);
    expect(deps.sleeps).toEqual([500]);
  });

  it("stops claiming after 240 s on its clock", async () => {
    await oneStaleShelter(["a@example.org", "b@example.org", "c@example.org", "d@example.org"]);
    const provider = fakeMail();
    let elapsed = 0;
    provider.state.onSend = () => {
      elapsed += 100_000;
    };
    const counts = await runWeeklyReminders(
      depsOf(db, provider.mail, { now: () => new Date(NOW.getTime() + elapsed) }),
    );
    expect(provider.sent).toHaveLength(3);
    expect(counts).toMatchObject({ sent: 3, deferred: 1, stoppedForTime: true });
  });
});

describe("a failed weekly mail is retried by the daily sweep, from the cards as they are now", () => {
  async function failedReminder() {
    const shelter = await listedShelter();
    await seedCard(db, shelter, stale());
    const failing = fakeMail();
    failing.state.failing = true;
    await runWeeklyReminders(depsOf(db, failing.mail));
    const [row] = await db.select().from(notificationSends);
    expect(row).toMatchObject({ kind: "freshnessReminder", status: "failed", attempts: 1 });
    expect(row?.dedupKey).toMatch(/^fr:[0-9a-f-]{36}:2026-W46:[0-9a-f]{16}$/);
    return shelter;
  }

  it("sends it once while cards are still unconfirmed", async () => {
    await failedReminder();
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(counts).toMatchObject({ retried: 1, retrySent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe("1 картка чекає на підтвердження");
  });

  it("drops it once the shelter has confirmed its cards or switched the mail off", async () => {
    await failedReminder();
    await db.update(shelters).set({ freshnessReminderOffAt: NOW });
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(counts).toMatchObject({ retried: 1, retryDropped: 1 });
    expect(await db.select().from(notificationSends)).toMatchObject([
      { status: "failed", attempts: 2 },
    ]);
  });

  it("is not rebuilt for a week the row was not claimed in", async () => {
    await failedReminder();
    const [row] = await db.select().from(notificationSends);
    const wrong = row?.dedupKey.replace("2026-W46", "2026-W30") ?? "";
    await db.update(notificationSends).set({ dedupKey: wrong });
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(counts).toMatchObject({ retried: 1, retryDropped: 1 });
  });
});

describe("the operator is not mailed the weekly reminder", () => {
  it("a shelter's reminder goes to its admins only", async () => {
    await seedOperator(db, "op@example.org");
    const shelter = await listedShelter(["a@example.org"]);
    await seedCard(db, shelter, stale());
    const { mail, sent } = fakeMail();
    await runWeeklyReminders(depsOf(db, mail));
    expect(sentTo(sent)).toEqual(["a@example.org"]);
  });
});
describe("the daily and the weekly cron share one budget; the quota arithmetic is pinned", () => {
  const fill = async (count: number, kind: string, createdAt = NOW) => {
    for (let n = 0; n < count; n += 1) {
      await db.insert(notificationSends).values({
        dedupKey: `fill:${kind}:${createdAt.toISOString()}:${n}`,
        kind,
        shelterId: null,
        recipientUserId: null,
        status: "sent",
        attempts: 1,
        createdAt,
        updatedAt: createdAt,
      });
    }
  };
  const staleShelters = async (count: number, prefix = "weekly") => {
    const emails: string[] = [];
    for (let n = 0; n < count; n += 1) {
      const email = `${prefix}-${n}@example.org`;
      emails.push(email);
      const shelter = await listedShelter([email]);
      await seedCard(db, shelter, stale());
    }
    return emails;
  };
  const NEXT_WEEK = new Date(NOW.getTime() + 7 * DAY);

  it("pins the arithmetic: event cap 40 plus the batch budget 20 is at most 60 of the 100 a day", () => {
    expect(DEFAULT_DAILY_EVENT_CAP).toBe(40);
    expect(DAILY_SEND_BUDGET).toBe(20);
    expect(DEFAULT_DAILY_EVENT_CAP + DAILY_SEND_BUDGET).toBeLessThanOrEqual(60);
  });

  it("Monday: what the daily run left of the budget is all the weekly run may send", async () => {
    await staleShelters(3);
    await fill(18, "earlyListingEnding");
    const { mail, sent } = fakeMail();
    const counts = await runWeeklyReminders(depsOf(db, mail, { eventCap: 1000 }));
    expect(sent).toHaveLength(2);
    expect(counts).toMatchObject({ sent: 2, deferred: 1 });
  });

  it("Monday: with the budget spent the weekly run sends none and carries every shelter to next week", async () => {
    const emails = await staleShelters(3);
    await fill(20, "earlyListingEnding");
    const { mail, sent } = fakeMail();
    const counts = await runWeeklyReminders(depsOf(db, mail, { eventCap: 1000 }));
    expect(sent).toEqual([]);
    expect(counts).toMatchObject({ shelters: 3, sent: 0, deferred: 3 });
    // Nothing was claimed, so nothing reads as sent.
    expect(
      (await db.select().from(notificationSends)).filter((row) => row.kind === "freshnessReminder"),
    ).toEqual([]);
    await runWeeklyReminders(depsOf(db, mail, { now: NEXT_WEEK, eventCap: 1000 }));
    expect(sentTo(sent)).toEqual([...emails].sort());
  });

  it("a shelter the budget skipped leads the next week, so the same ones are never starved", async () => {
    const emails = await staleShelters(3);
    const { mail, sent } = fakeMail();
    await runWeeklyReminders(depsOf(db, mail, { eventCap: 1000 }), 2);
    const served = sentTo(sent);
    expect(served).toHaveLength(2);
    const skipped = emails.find((email) => !served.includes(email));
    expect(skipped).toBeDefined();
    const second = fakeMail();
    await runWeeklyReminders(depsOf(db, second.mail, { now: NEXT_WEEK, eventCap: 1000 }), 1);
    expect(sentTo(second.sent)).toEqual([skipped]);
    // And the week after, the one served longest ago goes first.
    const third = fakeMail();
    await runWeeklyReminders(
      depsOf(db, third.mail, { now: new Date(NOW.getTime() + 14 * DAY), eventCap: 1000 }),
      1,
    );
    expect(sentTo(third.sent)).toHaveLength(1);
    expect(sentTo(third.sent)[0]).not.toBe(skipped);
  });

  it("a day that is not Monday: the daily run alone sends at most the budget, and a second run none", async () => {
    for (let n = 0; n < 13; n += 1) {
      await seedShelter(db, {
        overrides: {
          verification: PENDING,
          earlyListingSince: new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 2 - (n % 5)) * DAY),
        } as Partial<Shelter>,
      });
    }
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    const { mail, sent } = fakeMail();
    const first = await runDailyNotifications(depsOf(db, mail, { eventCap: 1000 }));
    expect(sent).toHaveLength(20);
    expect(first.endingSent).toBe(20);
    const again = await runDailyNotifications(depsOf(db, mail, { eventCap: 1000 }));
    expect(sent).toHaveLength(20);
    expect(again.endingSent).toBe(0);
  });

  it("events and batches together stay within the cap: 25 events leave room for 15 of the 20", async () => {
    await fill(25, "approved");
    for (let n = 0; n < 13; n += 1) {
      await seedShelter(db, {
        overrides: {
          verification: PENDING,
          earlyListingSince: new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 2 - (n % 5)) * DAY),
        } as Partial<Shelter>,
      });
    }
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    await staleShelters(2);
    const { mail, sent } = fakeMail();
    const daily = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toHaveLength(15);
    expect(daily.skippedOverCap).toBeGreaterThan(0);
    const weekly = await runWeeklyReminders(depsOf(db, mail));
    expect(sent).toHaveLength(15);
    expect(weekly).toMatchObject({ sent: 0, skippedOverCap: 2 });
    const total = (await db.select().from(notificationSends)).length;
    expect(total).toBe(40);
  });

  it("Monday peak: cap reached with a pending retry and a weekly reminder due, nothing reaches the sender", async () => {
    // A failed retry from yesterday and one more failed mail today, then a weekly reminder due.
    await staleShelters(1);
    const failing = fakeMail();
    failing.state.failing = true;
    await runWeeklyReminders(depsOf(db, failing.mail, { eventCap: 1000 }));
    await db.update(notificationSends).set({ createdAt: new Date(NOW.getTime() - 20 * 3_600_000) });
    await fill(2, "approved");
    const before = await db.select().from(notificationSends);
    const { mail, sent } = fakeMail();
    const deps = { eventCap: 2 };
    const daily = await runDailyNotifications(depsOf(db, mail, deps));
    const more = await staleShelters(1, "late");
    const weekly = await runWeeklyReminders(depsOf(db, mail, deps));
    expect(sent).toEqual([]);
    expect(daily.skippedOverCap).toBeGreaterThanOrEqual(1);
    expect(weekly.skippedOverCap).toBeGreaterThanOrEqual(1);
    expect(more).toHaveLength(1);
    // The same rows, attempts and statuses included: nothing was claimed, retried or closed.
    const byKey = <T extends { dedupKey: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.dedupKey.localeCompare(b.dedupKey));
    expect(byKey(await db.select().from(notificationSends))).toEqual(byKey(before));
  });
});
describe("two runs at the same moment (a Monday's daily and weekly cron, or a cron delivered twice)", () => {
  const dueEarlyListing = async (shelters: number) => {
    for (let n = 0; n < shelters; n += 1) {
      await seedShelter(db, {
        overrides: {
          verification: PENDING,
          earlyListingSince: new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 2 - (n % 5)) * DAY),
        } as Partial<Shelter>,
      });
    }
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
  };
  const staleWithAdmins = async (count: number) => {
    for (let n = 0; n < count; n += 1) {
      const shelter = await listedShelter([`concurrent-${n}@example.org`]);
      await seedCard(db, shelter, stale());
    }
  };
  /** One mail per run may be in flight between its read of the tally and its claim. */
  const IN_FLIGHT_PER_RUN = 1;

  it("the daily and the weekly run together send the budget, not a budget each", async () => {
    await dueEarlyListing(13);
    await staleWithAdmins(30);
    const daily = fakeMail();
    const weekly = fakeMail();
    daily.state.delayMs = 3;
    weekly.state.delayMs = 3;
    await Promise.all([
      runDailyNotifications(depsOf(db, daily.mail, { eventCap: 1000 })),
      runWeeklyReminders(depsOf(db, weekly.mail, { eventCap: 1000 })),
    ]);
    const combined = daily.sent.length + weekly.sent.length;
    expect(combined).toBeGreaterThanOrEqual(DAILY_SEND_BUDGET);
    expect(combined).toBeLessThanOrEqual(DAILY_SEND_BUDGET + 2 * IN_FLIGHT_PER_RUN);
    expect(daily.sent.length).toBeGreaterThan(0);
    expect(weekly.sent.length).toBeGreaterThan(0);
  });

  it("two runs at the same moment stay inside the event cap too", async () => {
    await dueEarlyListing(13);
    await staleWithAdmins(30);
    const daily = fakeMail();
    const weekly = fakeMail();
    daily.state.delayMs = 3;
    weekly.state.delayMs = 3;
    await Promise.all([
      runDailyNotifications(depsOf(db, daily.mail, { eventCap: 12 })),
      runWeeklyReminders(depsOf(db, weekly.mail, { eventCap: 12 })),
    ]);
    const combined = daily.sent.length + weekly.sent.length;
    expect(combined).toBeGreaterThanOrEqual(12);
    expect(combined).toBeLessThanOrEqual(12 + 2 * IN_FLIGHT_PER_RUN);
  });

  it("a weekly cron delivered twice at once mails nobody twice", async () => {
    await staleWithAdmins(10);
    const first = fakeMail();
    const second = fakeMail();
    first.state.delayMs = 3;
    second.state.delayMs = 3;
    await Promise.all([
      runWeeklyReminders(depsOf(db, first.mail, { eventCap: 1000 })),
      runWeeklyReminders(depsOf(db, second.mail, { eventCap: 1000 })),
    ]);
    const recipients = sentTo([...first.sent, ...second.sent]);
    expect(recipients).toHaveLength(10);
    expect(new Set(recipients).size).toBe(10);
  });
});
