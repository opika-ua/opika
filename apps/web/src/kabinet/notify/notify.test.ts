import type { Database } from "@opika/db";
import { notificationSendsRepo } from "@opika/db/repos";
import { authMember, notificationSends, shelterHistory } from "@opika/db/schema";
import { setupTestDatabase, truncateAll } from "@opika/db/test";
import type { ModeratorId, Shelter, ShelterHistoryEntry } from "@opika/domain";
import { EARLY_LISTING_DAYS } from "@opika/domain";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { handleNotificationsCron } from "../notifications-cron";
import { notifyAfterWrite } from "./after-write";
import { DAILY_SEND_BUDGET, runDailyNotifications } from "./daily";
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
} from "./test-fixtures";

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

  it("the budget is 60, short of Resend's 100 a day", () => {
    expect(DAILY_SEND_BUDGET).toBe(60);
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
