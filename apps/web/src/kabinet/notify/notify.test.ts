import type { Database } from "@opika/db";
import { notificationSendsRepo } from "@opika/db/repos";
import { authMember, notificationSends, shelterHistory, shelters } from "@opika/db/schema";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, Shelter, ShelterHistoryEntry } from "@opika/domain";
import { EARLY_LISTING_DAYS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleNotificationsCron } from "../notifications-cron";
import { notifyAfterWrite } from "./after-write";
import { DAILY_SEND_BUDGET, runDailyNotifications } from "./daily";
import { dedupKeyOf } from "./dedup";
import { SEND_SPACING_MS } from "./deliver";
import type { HistoryLine } from "./intents";
import {
  DAY,
  depsOf,
  fakeMail,
  NOW,
  PENDING,
  seedOperator,
  seedShelter,
  seedUser,
  VERIFIED,
} from "./test-utils/fixtures";

/**
 * The send path against a real database: the claim is a property of the SQL, the recipients come
 * from the real tables, and only the provider is fake (nothing here reaches Resend).
 */

let db: Awaited<ReturnType<typeof setupTestDatabase>>["db"];
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await setupTestDatabase());
});
afterAll(async () => cleanup?.());
beforeEach(async () => truncateAll(db));

const MODERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
const LINK = { url: "https://donate.example.org/jar/abc?utm=x", provider: "other" } as const;
const asAdmin = { kind: "shelter_admin", shelterAdminId: "a1" } as const;
const asModerator = { kind: "moderator", moderatorId: MODERATOR } as const;

const approveLine = (id = "approve-1"): HistoryLine => ({
  id,
  entry: {
    kind: "verification",
    event: { type: "approve", at: NOW, moderatorId: MODERATOR },
    from: "under_review",
    to: "verified",
  } as unknown as ShelterHistoryEntry,
});
const resubmitLine = (actor: unknown, id = "resubmit-1"): HistoryLine => ({
  id,
  entry: {
    kind: "verification",
    event: { type: "resubmit", at: NOW, actor, evidence: { items: [], submittedAt: NOW } },
    from: "rejected",
    to: "pending",
  } as unknown as ShelterHistoryEntry,
});
const decidedLine = (decision: "approved" | "rejected", id = "decided-1"): HistoryLine => ({
  id,
  entry: {
    kind: "donation_decided",
    at: NOW,
    moderatorId: MODERATOR,
    decision,
    link: LINK,
    previousLive: null,
  } as unknown as ShelterHistoryEntry,
});

const sendRows = () => db.select().from(notificationSends);
const sentTo = (sent: { to: string }[]) => sent.map((email) => email.to).sort();

describe("notifyAfterWrite: who is mailed", () => {
  it("approval goes to every member of the shelter and to nobody else", async () => {
    const { shelter } = await seedShelter(db, { admins: ["one@example.org", "two@example.org"] });
    await seedOperator(db, "op@example.org");
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [approveLine()]);
    expect(sentTo(sent)).toEqual(["one@example.org", "two@example.org"]);
    expect(sent[0]?.subject).toBe("Притулок пройшов перевірку");
    expect(sent[0]?.text).toContain("https://example.org/kabinet");
  });

  it("an invitee who has not accepted has no membership and is not mailed", async () => {
    const { shelter } = await seedShelter(db, { admins: ["member@example.org"] });
    await seedUser(db, "invitee@example.org");
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [approveLine()]);
    expect(sentTo(sent)).toEqual(["member@example.org"]);
  });

  it("a shelter with no admin yet is mailed nobody and nothing is claimed", async () => {
    const { shelter } = await seedShelter(db);
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [approveLine()]);
    expect(sent).toEqual([]);
    expect(await sendRows()).toEqual([]);
  });

  it("a shelter's resubmit mails every active operator, not a revoked one", async () => {
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    await seedOperator(db, "former@example.org", { revoked: true });
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [resubmitLine(asAdmin)]);
    expect(sentTo(sent)).toEqual(["op1@example.org", "op2@example.org"]);
    expect(sent[0]?.text).toContain(`/kabinet/prytulky/${shelter.id}`);
  });

  it("the operator's own resubmit mails no operator", async () => {
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    await seedOperator(db, "op@example.org");
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [resubmitLine(asModerator)]);
    expect(sent).toEqual([]);
    expect(await sendRows()).toEqual([]);
  });

  it("a reinstatement is not an approval", async () => {
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const { mail, sent } = fakeMail();
    const reinstate: HistoryLine = {
      id: "reinstate-1",
      entry: {
        kind: "verification",
        event: { type: "reinstate", at: NOW, moderatorId: MODERATOR },
        from: "suspended",
        to: "verified",
      } as unknown as ShelterHistoryEntry,
    };
    await notifyAfterWrite(depsOf(db, mail), shelter, [reinstate]);
    expect(sent).toEqual([]);
  });

  it("a proposed link tells the operators its host and nothing of its path", async () => {
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    await seedOperator(db, "op@example.org");
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [
      {
        id: "proposed-1",
        entry: {
          kind: "donation_proposed",
          at: NOW,
          actor: asAdmin,
          link: LINK,
        } as unknown as ShelterHistoryEntry,
      },
    ]);
    expect(sentTo(sent)).toEqual(["op@example.org"]);
    expect(sent[0]?.text).toContain("donate.example.org");
    expect(sent[0]?.text).not.toContain("/jar/abc");
    expect(sent[0]?.text).not.toContain("utm");
  });

  it("S3 reads differently for a verified shelter and one still in review", async () => {
    const verified = await seedShelter(db, {
      admins: ["v@example.org"],
      overrides: { verification: VERIFIED } as Partial<Shelter>,
    });
    const pending = await seedShelter(db, {
      admins: ["p@example.org"],
      overrides: { verification: PENDING } as Partial<Shelter>,
    });
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), verified.shelter, [decidedLine("approved", "d1")]);
    await notifyAfterWrite(depsOf(db, mail), pending.shelter, [decidedLine("approved", "d2")]);
    const [now, later] = sent;
    expect(now?.text).toContain("Люди бачать його на сторінці притулку.");
    expect(later?.text).toContain("Люди побачать його, щойно притулок пройде перевірку.");
  });

  it("S4 and S2 reach the shelter's admins", async () => {
    const { shelter } = await seedShelter(db, { admins: ["shelter@example.org"] });
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [
      decidedLine("rejected"),
      {
        id: "allowed-1",
        entry: {
          kind: "early_listing_allowed",
          at: NOW,
          moderatorId: MODERATOR,
          period: 1,
          note: null,
        } as unknown as ShelterHistoryEntry,
      },
    ]);
    expect(sent.map((email) => email.subject)).toEqual([
      "Посилання на збір не підтверджено",
      "Картки притулку вже видно",
    ]);
  });
});

describe("notifyAfterWrite: sent once, never throws", () => {
  it("the same history line mails nobody twice", async () => {
    const { shelter } = await seedShelter(db, { admins: ["a@example.org", "b@example.org"] });
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [approveLine()]);
    await notifyAfterWrite(depsOf(db, mail), shelter, [approveLine()]);
    expect(sent).toHaveLength(2);
    expect((await sendRows()).map((row) => row.status)).toEqual(["sent", "sent"]);
  });

  it("two racing notifies for the same line send once per recipient", async () => {
    const { shelter } = await seedShelter(db, { admins: ["a@example.org"] });
    const { mail, sent } = fakeMail();
    await Promise.all([
      notifyAfterWrite(depsOf(db, mail), shelter, [approveLine()]),
      notifyAfterWrite(depsOf(db, mail), shelter, [approveLine()]),
    ]);
    expect(sent).toHaveLength(1);
  });

  it("keeps a hash of the user id in the key, never the id", async () => {
    const { shelter, adminIds } = await seedShelter(db, { admins: ["a@example.org"] });
    const { mail } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [approveLine("h-1")]);
    const [row] = await sendRows();
    expect(row?.dedupKey).toMatch(/^h:h-1:[0-9a-f]{16}$/);
    expect(row?.dedupKey).not.toContain(adminIds[0] ?? "?");
    expect(row?.recipientUserId).toBe(adminIds[0]);
    expect(row?.shelterId).toBe(shelter.id);
    expect(row?.kind).toBe("approved");
  });

  it("a provider failure is logged masked, recorded as failed and never thrown", async () => {
    const { shelter } = await seedShelter(db, { admins: ["person@example.org"] });
    const { mail, sent, state } = fakeMail();
    state.failing = true;
    const deps = depsOf(db, mail);
    await expect(notifyAfterWrite(deps, shelter, [approveLine()])).resolves.toBeUndefined();
    expect(sent).toEqual([]);
    expect((await sendRows()).map((row) => row.status)).toEqual(["failed"]);
    expect(deps.logs).toHaveLength(1);
    expect(deps.logs[0]).toContain("p•••@example.org");
    expect(deps.logs[0]).not.toContain("person@");
    expect(deps.logs[0]).toContain("approved");
  });

  it("a database failure is logged and never thrown", async () => {
    const { shelter } = await seedShelter(db, { admins: ["a@example.org"] });
    const { mail } = fakeMail();
    const deps = depsOf({} as unknown as Database, mail);
    await expect(notifyAfterWrite(deps, shelter, [approveLine()])).resolves.toBeUndefined();
    expect(deps.logs).toHaveLength(1);
    expect(deps.logs[0]).not.toContain("@");
  });

  it("a mail whose copy is still pending is refused, not sent", async () => {
    const { shelter } = await seedShelter(db, { admins: ["a@example.org"] });
    const { mail, sent } = fakeMail();
    const deps = depsOf(db, mail);
    // The refusal is `sendChecked`'s: a body holding the marker never reaches the sender.
    deps.context.operatorName = "[COPY PENDING] Олексій";
    await notifyAfterWrite(deps, shelter, [approveLine()]);
    expect(sent).toEqual([]);
    expect((await sendRows()).map((row) => row.status)).toEqual(["failed"]);
  });
});

describe("runDailyNotifications: O4", () => {
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
  const early = (since: Date | null, overrides: Partial<Shelter> = {}) =>
    ({ verification: PENDING, earlyListingSince: since, ...overrides }) as Partial<Shelter>;

  async function allowedHistory(shelterId: string, periods: number) {
    for (let n = 1; n <= periods; n += 1) {
      await db.insert(shelterHistory).values({
        id: `allowed-${shelterId}-${n}`,
        shelterId: shelterId as never,
        kind: "early_listing_allowed",
        at: ago(100 - n),
        entry: {
          kind: "early_listing_allowed",
          at: ago(100 - n),
          moderatorId: MODERATOR as ModeratorId,
          period: n,
          note: null,
        },
      });
    }
  }

  it("mails every operator once for a period ending within 7 days", async () => {
    const { shelter } = await seedShelter(db, { overrides: early(ago(EARLY_LISTING_DAYS - 5)) });
    await allowedHistory(shelter.id, 1);
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sentTo(sent)).toEqual(["op1@example.org", "op2@example.org"]);
    expect(counts).toMatchObject({ endingSent: 2, failed: 0, duplicates: 0, deferred: 0 });
    expect(sent[0]?.subject).toContain("Показ до перевірки закінчується");
    expect(sent[0]?.text).toContain("Подовжити показ можна ще один раз.");
  });

  it("is not sent again on the next days of the same period", async () => {
    const { shelter } = await seedShelter(db, { overrides: early(ago(EARLY_LISTING_DAYS - 5)) });
    await allowedHistory(shelter.id, 1);
    await seedOperator(db, "op@example.org");
    const { mail, sent } = fakeMail();
    await runDailyNotifications(depsOf(db, mail));
    const second = await runDailyNotifications(
      depsOf(db, mail, { now: new Date(NOW.getTime() + DAY) }),
    );
    expect(sent).toHaveLength(1);
    expect(second).toMatchObject({ endingSent: 0, duplicates: 1 });
  });

  it("a second period is a new mail, and says nothing of a further extension", async () => {
    const { shelter } = await seedShelter(db, { overrides: early(ago(EARLY_LISTING_DAYS - 5)) });
    await allowedHistory(shelter.id, 2);
    await seedOperator(db, "op@example.org");
    const { mail, sent } = fakeMail();
    await runDailyNotifications(depsOf(db, mail));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).not.toContain("Подовжити показ");
  });

  it("is not sent for a shelter that is not listing early, or has more than 7 days left", async () => {
    await seedShelter(db, { overrides: early(null) });
    await seedShelter(db, { overrides: early(ago(10)) });
    await seedShelter(db, { overrides: early(ago(EARLY_LISTING_DAYS + 1)) });
    await seedShelter(db, {
      overrides: { verification: VERIFIED, earlyListingSince: ago(55) } as Partial<Shelter>,
    });
    await seedOperator(db, "op@example.org");
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(counts.endingSent).toBe(0);
    expect(await sendRows()).toEqual([]);
  });

  it("stops at the budget, leaves the rest unclaimed and finishes them the next run", async () => {
    for (let n = 0; n < 3; n += 1) {
      await seedShelter(db, { overrides: early(ago(EARLY_LISTING_DAYS - 5 - n)) });
    }
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    const { mail, sent } = fakeMail();
    const first = await runDailyNotifications(depsOf(db, mail), 4);
    expect(sent).toHaveLength(4);
    expect(first).toMatchObject({ endingSent: 4, deferred: 2 });
    expect(await sendRows()).toHaveLength(4);
    const second = await runDailyNotifications(depsOf(db, mail), 4);
    expect(sent).toHaveLength(6);
    expect(second).toMatchObject({ endingSent: 2, duplicates: 4, deferred: 0 });
  });

  it("the budget is 20, so the cap (40) plus a full run is 60 of Resend's 100 a day", () => {
    expect(DAILY_SEND_BUDGET).toBe(20);
  });

  it("a run with the default budget sends at most 20 and leaves the rest for tomorrow", async () => {
    for (let n = 0; n < 11; n += 1) {
      await seedShelter(db, { overrides: early(ago(EARLY_LISTING_DAYS - 2 - (n % 5))) });
    }
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toHaveLength(DAILY_SEND_BUDGET);
    expect(counts).toMatchObject({ endingSent: 20, deferred: 2 });
  });

  it("waits at least 500 ms between sends, and not before the first", async () => {
    for (let n = 0; n < 2; n += 1) {
      await seedShelter(db, { overrides: early(ago(EARLY_LISTING_DAYS - 5 - n)) });
    }
    await seedOperator(db, "op@example.org");
    const { mail } = fakeMail();
    const deps = depsOf(db, mail);
    await runDailyNotifications(deps);
    expect(SEND_SPACING_MS).toBe(500);
    expect(deps.sleeps).toEqual([500]);
  });
});

describe("runDailyNotifications: the retry sweep", () => {
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

  async function failedEndingMail() {
    const { shelter } = await seedShelter(db, {
      overrides: {
        verification: PENDING,
        earlyListingSince: ago(EARLY_LISTING_DAYS - 5),
      } as Partial<Shelter>,
    });
    await seedOperator(db, "op@example.org");
    const failing = fakeMail();
    failing.state.failing = true;
    await runDailyNotifications(depsOf(db, failing.mail));
    return shelter;
  }

  it("retries a failed mail once, on the next run", async () => {
    await failedEndingMail();
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toHaveLength(1);
    expect(counts).toMatchObject({ retried: 1, retrySent: 1 });
    const [row] = await sendRows();
    expect(row).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("gives up after the one retry fails too", async () => {
    await failedEndingMail();
    const failing = fakeMail();
    failing.state.failing = true;
    await runDailyNotifications(depsOf(db, failing.mail));
    const { mail, sent } = fakeMail();
    const third = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(third).toMatchObject({ retried: 0, retrySent: 0 });
    const [row] = await sendRows();
    expect(row).toMatchObject({ status: "failed", attempts: 2 });
  });

  it("does not retry a failure older than 48 hours", async () => {
    await failedEndingMail();
    await db.update(notificationSends).set({ createdAt: ago(3) });
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(counts.retried).toBe(0);
    expect(sent).toEqual([]);
  });

  it("rebuilds an event mail from its history line and sends it", async () => {
    const { shelter, adminIds } = await seedShelter(db, { admins: ["a@example.org"] });
    await db.insert(shelterHistory).values({
      id: "approve-9",
      shelterId: shelter.id,
      kind: "verification",
      at: NOW,
      entry: approveLine("approve-9").entry,
    });
    const failing = fakeMail();
    failing.state.failing = true;
    await notifyAfterWrite(depsOf(db, failing.mail), shelter, [approveLine("approve-9")]);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sentTo(sent)).toEqual(["a@example.org"]);
    expect(counts.retrySent).toBe(1);
    expect(adminIds).toHaveLength(1);
  });

  it("drops the retry for someone who is no longer a member", async () => {
    const { shelter } = await seedShelter(db, { admins: ["a@example.org"] });
    await db.insert(shelterHistory).values({
      id: "approve-8",
      shelterId: shelter.id,
      kind: "verification",
      at: NOW,
      entry: approveLine("approve-8").entry,
    });
    const failing = fakeMail();
    failing.state.failing = true;
    await notifyAfterWrite(depsOf(db, failing.mail), shelter, [approveLine("approve-8")]);
    await db.delete(authMember);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(counts).toMatchObject({ retried: 1, retryDropped: 1, retrySent: 0 });
    expect((await sendRows())[0]).toMatchObject({ status: "failed", attempts: 2 });
  });

  it("sees a failed row through the repo's own window", async () => {
    await failedEndingMail();
    expect(await notificationSendsRepo(db).retryable(NOW)).toHaveLength(1);
  });
});

describe("the cron handler over a real run", () => {
  it("answers 200 with counts, and its log line holds counts only", async () => {
    const { shelter } = await seedShelter(db, {
      overrides: {
        verification: PENDING,
        earlyListingSince: new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 5) * DAY),
      } as Partial<Shelter>,
    });
    await seedOperator(db, "op@example.org");
    const { mail, sent } = fakeMail();
    const deps = depsOf(db, mail);
    const lines: string[] = [];
    const response = await handleNotificationsCron(
      new Request("https://example.org/api/cron/notifications", {
        headers: { authorization: "Bearer cron-secret" },
      }),
      { cronSecret: "cron-secret", notify: () => deps, log: (line) => lines.push(line) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ endingSent: 1 });
    expect(sent).toHaveLength(1);
    const logged = lines.join("\n");
    expect(logged).toContain('"endingSent":1');
    expect(logged).not.toContain("@");
    expect(logged).not.toContain(shelter.id);
    expect(logged).not.toContain(shelter.displayName);
  });
});
describe("the daily cap on event mails", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  async function claimedRows(count: number, createdAt: Date, kind = "approved") {
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
  }
  const admins = (count: number) => Array.from({ length: count }, (_, n) => `cap-${n}@example.org`);

  it("sends up to the cap, skips the rest with a log line and no handoff to the sender", async () => {
    const { shelter } = await seedShelter(db, { admins: admins(5) });
    const { mail, sent } = fakeMail();
    const deps = depsOf(db, mail, { eventCap: 3 });
    await notifyAfterWrite(deps, shelter, [approveLine()]);
    expect(sent).toHaveLength(3);
    expect(await sendRows()).toHaveLength(3);
    expect(deps.logs).toEqual(["[kabinet] notification event cap reached: 2 mail(s) not sent"]);
  });

  it("with the default 40: the 40th of the day sends and the 41st does not", async () => {
    await claimedRows(38, NOW);
    const { shelter } = await seedShelter(db, { admins: admins(3) });
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail), shelter, [approveLine()]);
    expect(sent).toHaveLength(2);
    expect(await sendRows()).toHaveLength(40);
  });

  it("counts event mails only, and only those claimed in the current Kyiv day", async () => {
    // 21:30 UTC on 9 November is 23:30 in Kyiv: the day before the one NOW is in.
    await claimedRows(10, new Date("2026-11-09T21:30:00.000Z"));
    await claimedRows(10, NOW, "something-else");
    const { shelter } = await seedShelter(db, { admins: admins(2) });
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail, { eventCap: 2 }), shelter, [approveLine()]);
    expect(sent).toHaveLength(2);
  });

  it("the day turns over at Kyiv midnight, not UTC midnight", async () => {
    const afterMidnight = new Date("2026-11-10T22:30:00.000Z");
    await claimedRows(2, new Date("2026-11-10T21:30:00.000Z"));
    await claimedRows(1, new Date("2026-11-10T22:10:00.000Z"));
    const { shelter } = await seedShelter(db, { admins: admins(3) });
    const { mail, sent } = fakeMail();
    // 22:30 UTC is 00:30 on the 11th in Kyiv: the two rows from 21:30 are yesterday's.
    await notifyAfterWrite(depsOf(db, mail, { now: afterMidnight, eventCap: 3 }), shelter, [
      approveLine(),
    ]);
    expect(sent).toHaveLength(2);
  });

  it("the next day sends again where the cap had stopped it", async () => {
    const { shelter } = await seedShelter(db, { admins: admins(2) });
    const { mail, sent } = fakeMail();
    await notifyAfterWrite(depsOf(db, mail, { eventCap: 1 }), shelter, [approveLine("day-1")]);
    expect(sent).toHaveLength(1);
    const tomorrow = new Date(NOW.getTime() + DAY_MS);
    await notifyAfterWrite(depsOf(db, mail, { now: tomorrow, eventCap: 1 }), shelter, [
      approveLine("day-2"),
    ]);
    expect(sent).toHaveLength(2);
  });

  it("the cron's O4 mails count against it too, and a capped one is counted, not sent", async () => {
    await seedShelter(db, {
      overrides: {
        verification: PENDING,
        earlyListingSince: new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 5) * DAY),
      } as Partial<Shelter>,
    });
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    await claimedRows(1, NOW);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail, { eventCap: 2 }));
    expect(sent).toHaveLength(1);
    expect(counts).toMatchObject({ endingSent: 1, skippedOverCap: 1 });
  });
});

describe("a shelter that repeats itself mails the operators once a day (O1, O2)", () => {
  const proposal = (id: string, at: Date, url: string): HistoryLine => ({
    id,
    entry: {
      kind: "donation_proposed",
      at,
      actor: asAdmin,
      link: { url, provider: "other" },
    } as unknown as ShelterHistoryEntry,
  });

  it("five proposals in a day send one mail per operator; the next Kyiv day sends one more", async () => {
    await seedOperator(db, "op1@example.org");
    await seedOperator(db, "op2@example.org");
    const { shelter } = await seedShelter(db, { admins: ["s@example.org"] });
    const { mail, sent } = fakeMail();
    for (let n = 0; n < 5; n += 1) {
      const at = new Date(NOW.getTime() + n * 60_000);
      await notifyAfterWrite(depsOf(db, mail, { now: at }), shelter, [
        proposal(`p-${n}`, at, `https://example.org/give/${n}`),
      ]);
    }
    expect(sent).toHaveLength(2);
    const tomorrow = new Date(NOW.getTime() + DAY);
    await notifyAfterWrite(depsOf(db, mail, { now: tomorrow }), shelter, [
      proposal("p-next", tomorrow, "https://example.org/give/next"),
    ]);
    expect(sent).toHaveLength(4);
  });

  it("the day is a Kyiv day: 23:59 and 00:01 Kyiv are two", async () => {
    await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db);
    const { mail, sent } = fakeMail();
    for (const [id, iso] of [
      ["a", "2026-11-10T21:59:00.000Z"],
      ["b", "2026-11-10T22:01:00.000Z"],
    ] as const) {
      const at = new Date(iso);
      await notifyAfterWrite(depsOf(db, mail, { now: at }), shelter, [
        proposal(id, at, "https://example.org/give"),
      ]);
    }
    expect(sent).toHaveLength(2);
  });
});

describe("a send that got no answer is never retried", () => {
  async function firstAttempt(status: number | null) {
    const { shelter } = await seedShelter(db, { admins: ["a@example.org"] });
    await db.insert(shelterHistory).values({
      id: "approve-7",
      shelterId: shelter.id,
      kind: "verification",
      at: NOW,
      entry: approveLine("approve-7").entry,
    });
    const failing = fakeMail();
    failing.state.failing = true;
    failing.state.status = status;
    await notifyAfterWrite(depsOf(db, failing.mail), shelter, [approveLine("approve-7")]);
    return shelter;
  }

  it("a timeout may have delivered the mail: the row is closed, the next sweep sends nothing", async () => {
    await firstAttempt(null);
    expect(await sendRows()).toMatchObject([{ status: "failed", attempts: 2 }]);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(counts.retried).toBe(0);
  });

  it("an answered refusal stays retryable once", async () => {
    await firstAttempt(500);
    expect(await sendRows()).toMatchObject([{ status: "failed", attempts: 1 }]);
    const { mail, sent } = fakeMail();
    await runDailyNotifications(depsOf(db, mail));
    expect(sent).toHaveLength(1);
  });
});

describe("the daily time guard", () => {
  it("stops claiming after 240 s, leaves the rest unclaimed and finishes them next run", async () => {
    for (let n = 0; n < 5; n += 1) {
      await seedShelter(db, {
        overrides: {
          verification: PENDING,
          earlyListingSince: new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 2 - n) * DAY),
        } as Partial<Shelter>,
      });
    }
    await seedOperator(db, "op@example.org");
    const provider = fakeMail();
    let elapsed = 0;
    // Each send takes 100 s on this clock.
    provider.state.onSend = () => {
      elapsed += 100_000;
    };
    const first = await runDailyNotifications(
      depsOf(db, provider.mail, { now: () => new Date(NOW.getTime() + elapsed) }),
    );
    expect(provider.sent).toHaveLength(3);
    expect(first).toMatchObject({ endingSent: 3, deferred: 2, stoppedForTime: true });
    expect(await sendRows()).toHaveLength(3);
    elapsed = 0;
    const second = await runDailyNotifications(
      depsOf(db, provider.mail, { now: () => new Date(NOW.getTime() + elapsed) }),
    );
    expect(provider.sent).toHaveLength(5);
    expect(second).toMatchObject({ endingSent: 2, stoppedForTime: false });
  });
});
describe("a retry of a per-day mail (O1, O2) is rebuilt from the shelter as it is now", () => {
  const link = { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" } as const;

  /** A failed first attempt left by the real path: a proposal or a review request that the provider refused. */
  async function failedFirstAttempt(kind: "proposal" | "review", overrides: Partial<Shelter>) {
    const operator = await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db, { overrides });
    const line: HistoryLine =
      kind === "proposal"
        ? {
            id: "dp-1",
            entry: {
              kind: "donation_proposed",
              at: NOW,
              actor: asAdmin,
              link,
            } as unknown as ShelterHistoryEntry,
          }
        : resubmitLine(asAdmin, "rr-1");
    const failing = fakeMail();
    failing.state.failing = true;
    await notifyAfterWrite(depsOf(db, failing.mail), shelter, [line]);
    const [row] = await sendRows();
    expect(row).toMatchObject({ status: "failed", attempts: 1 });
    return { shelter, operator, row };
  }
  const pendingDonation = { link, proposedAt: NOW, proposedBy: null };

  it("sends a proposal that is still waiting, naming the link the shelter has now", async () => {
    await failedFirstAttempt("proposal", {
      pendingDonation,
    } as Partial<Shelter>);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(counts).toMatchObject({ retried: 1, retrySent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toContain("send.monobank.ua");
  });

  it("closes the row without a mail once the proposal is gone (approved, rejected or cancelled)", async () => {
    await failedFirstAttempt("proposal", { pendingDonation } as Partial<Shelter>);
    await db.update(shelters).set({ pendingDonation: null });
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(counts).toMatchObject({ retried: 1, retryDropped: 1, retrySent: 0 });
    expect(sent).toEqual([]);
    expect(await sendRows()).toMatchObject([{ status: "failed", attempts: 2 }]);
  });

  it("sends a review request while the shelter still waits", async () => {
    await failedFirstAttempt("review", { verification: PENDING } as Partial<Shelter>);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(counts).toMatchObject({ retried: 1, retrySent: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toContain("Повторна перевірка");
  });

  it("drops a review request once the shelter is no longer waiting", async () => {
    await failedFirstAttempt("review", { verification: PENDING } as Partial<Shelter>);
    await db.update(shelters).set({
      verificationStatus: "under_review",
      verification: {
        status: "under_review",
        startedAt: NOW,
        reviewerId: MODERATOR as ModeratorId,
        evidence: { items: [], submittedAt: NOW },
      },
    });
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(counts).toMatchObject({ retried: 1, retryDropped: 1, retrySent: 0 });
    expect(sent).toEqual([]);
    expect(await sendRows()).toMatchObject([{ status: "failed", attempts: 2 }]);
  });

  it("never rebuilds a row whose key names another shelter or a day it was not claimed on", async () => {
    const operator = await seedOperator(db, "op@example.org");
    const { shelter } = await seedShelter(db, {
      overrides: { pendingDonation } as Partial<Shelter>,
    });
    const other = await seedShelter(db, { overrides: { pendingDonation } as Partial<Shelter> });
    const sends = notificationSendsRepo(db);
    const claim = async (dedupBase: string, shelterId: string) => {
      const dedupKey = dedupKeyOf(dedupBase, operator);
      await sends.claim(NOW, {
        dedupKey,
        kind: "donationProposed",
        shelterId: shelterId as never,
        recipientUserId: operator,
      });
      await sends.mark(NOW, dedupKey, "failed");
      return dedupKey;
    };
    const today = "2026-11-10";
    const otherShelter = await claim(`dp:${other.shelter.id}:${today}`, shelter.id);
    const otherDay = await claim(`dp:${shelter.id}:2026-11-08`, shelter.id);
    const rightKey = await claim(`dp:${shelter.id}:${today}`, shelter.id);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(counts).toMatchObject({ retried: 3, retrySent: 1, retryDropped: 2 });
    expect(sent).toHaveLength(1);
    const status = async (key: string) =>
      (await sendRows()).find((row) => row.dedupKey === key)?.status;
    expect(await status(rightKey)).toBe("sent");
    expect(await status(otherShelter)).toBe("failed");
    expect(await status(otherDay)).toBe("failed");
  });
});
describe("retries count against the daily event cap", () => {
  async function failedMails(count: number) {
    // `count` operator mails that the provider refused, left failed and retryable.
    await seedShelter(db, {
      overrides: {
        verification: PENDING,
        earlyListingSince: new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 3) * DAY),
      } as Partial<Shelter>,
    });
    for (let n = 0; n < count; n += 1) await seedOperator(db, `retry-${n}@example.org`);
    const failing = fakeMail();
    failing.state.failing = true;
    await runDailyNotifications(depsOf(db, failing.mail));
    expect((await sendRows()).filter((row) => row.status === "failed")).toHaveLength(count);
  }

  it("cap reached: no retry reaches the sender, the rows stay failed and it is counted", async () => {
    await failedMails(2);
    const { mail, sent } = fakeMail();
    // Two sends already today (the two failed first attempts): the cap of 2 is spent.
    const counts = await runDailyNotifications(depsOf(db, mail, { eventCap: 2 }));
    expect(sent).toEqual([]);
    expect(counts).toMatchObject({ retried: 0, retrySent: 0, skippedOverCap: 2 });
    expect(await sendRows()).toMatchObject([
      { status: "failed", attempts: 1 },
      { status: "failed", attempts: 1 },
    ]);
  });

  it("cap not reached: the retry is sent", async () => {
    await failedMails(2);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail, { eventCap: 40 }));
    expect(sent).toHaveLength(2);
    expect(counts).toMatchObject({ retried: 2, retrySent: 2, skippedOverCap: 0 });
  });

  it("room for exactly one more: one retry goes, the other waits for a later run", async () => {
    await failedMails(2);
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail, { eventCap: 3 }));
    expect(sent).toHaveLength(1);
    expect(counts).toMatchObject({ retrySent: 1, skippedOverCap: 1 });
    const statuses = (await sendRows()).map((row) => `${row.status}:${row.attempts}`).sort();
    expect(statuses).toEqual(["failed:1", "sent:2"]);
  });

  it("a retry made today uses a slot for the events that follow it", async () => {
    await failedMails(1);
    // The failed row is from yesterday, so only its retry counts today.
    await db.update(notificationSends).set({ createdAt: new Date(NOW.getTime() - 20 * 3_600_000) });
    const { mail, sent } = fakeMail();
    await runDailyNotifications(depsOf(db, mail, { eventCap: 2 }));
    expect(sent).toHaveLength(1);
    const { shelter } = await seedShelter(db, { admins: ["x@example.org", "y@example.org"] });
    const deps = depsOf(db, mail, { eventCap: 2 });
    await notifyAfterWrite(deps, shelter, [approveLine("after-retry")]);
    // 2 slots, 1 taken by the retry: one of the two admins is mailed.
    expect(sent).toHaveLength(2);
    expect(deps.logs).toEqual(["[kabinet] notification event cap reached: 1 mail(s) not sent"]);
  });
});

describe("the retry sweep, budget and recipient keys (Tier 1 follow-ups)", () => {
  it("a retry past the budget is not taken: it stays failed with attempts 1", async () => {
    await seedShelter(db, {
      overrides: {
        verification: PENDING,
        earlyListingSince: new Date(NOW.getTime() - (EARLY_LISTING_DAYS - 3) * DAY),
      } as Partial<Shelter>,
    });
    for (let n = 0; n < 3; n += 1) await seedOperator(db, `budget-${n}@example.org`);
    const failing = fakeMail();
    failing.state.failing = true;
    await runDailyNotifications(depsOf(db, failing.mail));
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail), 2);
    expect(sent).toHaveLength(2);
    expect(counts).toMatchObject({ retried: 2, retrySent: 2, deferred: 1 });
    const attempts = (await sendRows()).map((row) => `${row.status}:${row.attempts}`).sort();
    expect(attempts).toEqual(["failed:1", "sent:2", "sent:2"]);
  });

  it("a key whose user hash is another person's is never rebuilt, whatever its shelter and day", async () => {
    const operator = await seedOperator(db, "op@example.org");
    const other = await seedOperator(db, "other@example.org");
    const { shelter } = await seedShelter(db, {
      overrides: {
        pendingDonation: {
          link: { url: "https://send.monobank.ua/jar/abc", provider: "monobank_jar" },
          proposedAt: NOW,
          proposedBy: null,
        },
      } as Partial<Shelter>,
    });
    const sends = notificationSendsRepo(db);
    const base = `dp:${shelter.id}:2026-11-10`;
    // The row says it is for `operator`, but its key carries `other`'s hash.
    const dedupKey = dedupKeyOf(base, other);
    await sends.claim(NOW, {
      dedupKey,
      kind: "donationProposed",
      shelterId: shelter.id,
      recipientUserId: operator,
    });
    await sends.mark(NOW, dedupKey, "failed");
    const { mail, sent } = fakeMail();
    const counts = await runDailyNotifications(depsOf(db, mail));
    expect(sent).toEqual([]);
    expect(counts).toMatchObject({ retried: 1, retryDropped: 1 });
  });
});
