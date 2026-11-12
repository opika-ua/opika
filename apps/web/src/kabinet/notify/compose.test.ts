import type { ShelterId } from "@opika/domain";
import { COPY_PENDING, uk } from "@opika/i18n";
import { describe, expect, it } from "vitest";
import { emailBody } from "../email-message";
import { composeNotification } from "./compose";
import type { NotificationIntent } from "./intents";

const CONTEXT = { baseURL: "https://example.org/", operatorName: "Олексій" };
const SHELTER_ID = "11111111-1111-4111-8111-111111111111" as ShelterId;
const EXPIRES = new Date("2026-11-24T10:00:00.000Z");
const base = { shelterId: SHELTER_ID, shelterName: "Лапа", dedupBase: "h:x" } as const;

const INTENTS: NotificationIntent[] = [
  { ...base, kind: "reviewRequested", audience: "operators" },
  { ...base, kind: "donationProposed", audience: "operators", host: "donate.example.org" },
  { ...base, kind: "earlyListingEnding", audience: "operators", expiresAt: EXPIRES, period: 1 },
  { ...base, kind: "approved", audience: "shelter_admins" },
  { ...base, kind: "earlyListingAllowed", audience: "shelter_admins", expiresAt: EXPIRES },
  {
    ...base,
    kind: "donationApproved",
    audience: "shelter_admins",
    host: "donate.example.org",
    shownNow: true,
  },
  { ...base, kind: "donationRejected", audience: "shelter_admins", host: "donate.example.org" },
  { ...base, kind: "freshnessReminder", audience: "shelter_admins", staleCards: 3 },
];
const anchorTexts = (html: string) =>
  [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1] ?? "");
const mail = (intent: NotificationIntent) => composeNotification(intent, "to@example.org", CONTEXT);
const intentOf = (kind: NotificationIntent["kind"]) => {
  const found = INTENTS.find((i) => i.kind === kind);
  if (found === undefined) throw new Error(kind);
  return found;
};

describe("composeNotification", () => {
  it.each(INTENTS.map((i) => [i.kind, i] as const))(
    "%s fills every slot, holds no pending copy and links with a label",
    (_kind, intent) => {
      const email = mail(intent);
      for (const part of [email.subject, email.html, email.text]) {
        expect(part).not.toContain(COPY_PENDING);
        expect(part).not.toMatch(/\{\w+\}/);
      }
      expect(email.to).toBe("to@example.org");
      const [label] = anchorTexts(email.html);
      expect(label).toBeDefined();
      expect(label).not.toMatch(/https?:|www\./);
      expect(email.text).toContain("https://example.org/kabinet");
    },
  );

  it("operator mails open straight on the news: no greeting and no signature", () => {
    for (const kind of ["reviewRequested", "donationProposed", "earlyListingEnding"] as const) {
      const email = mail(intentOf(kind));
      expect(email.text).not.toContain("Добрий день");
      expect(email.text).not.toContain("Олексій");
    }
  });

  it("shelter mails open «Добрий день.» and are signed by the operator", () => {
    for (const kind of [
      "approved",
      "earlyListingAllowed",
      "donationApproved",
      "donationRejected",
    ] as const) {
      const email = mail(intentOf(kind));
      expect(email.text).toContain("Добрий день.");
      expect(email.text.trimEnd().endsWith("\nОлексій")).toBe(true);
    }
  });

  it("links each mail to its own screen", () => {
    expect(mail(intentOf("reviewRequested")).text).toContain(
      `https://example.org/kabinet/prytulky/${SHELTER_ID}`,
    );
    expect(mail(intentOf("approved")).text).toContain("https://example.org/kabinet\n");
    expect(mail(intentOf("earlyListingAllowed")).text).toContain(
      "https://example.org/kabinet/tvaryny",
    );
    expect(mail(intentOf("donationRejected")).text).toContain(
      "https://example.org/kabinet/prytulok",
    );
  });

  it("names the donation link by host and the date as a Kyiv day and month", () => {
    expect(mail(intentOf("donationProposed")).text).toContain("donate.example.org");
    expect(mail(intentOf("earlyListingEnding")).text).toContain("24 листопада");
    expect(mail(intentOf("earlyListingAllowed")).text).toContain("24 листопада");
  });

  it("S3 says people see the link now, or only once the shelter passes verification", () => {
    const approved = intentOf("donationApproved");
    if (approved.kind !== "donationApproved") throw new Error("kind");
    expect(mail({ ...approved, shownNow: true }).text).toContain(
      uk.kabinet.email.donationApproved.shownNow,
    );
    const notYet = mail({ ...approved, shownNow: false }).text;
    expect(notYet).toContain(uk.kabinet.email.donationApproved.notYet);
    expect(notYet).not.toContain(uk.kabinet.email.donationApproved.shownNow);
  });

  it("O4 offers the extra month once, in period 1 only", () => {
    const ending = intentOf("earlyListingEnding");
    if (ending.kind !== "earlyListingEnding") throw new Error("kind");
    const extendable = uk.kabinet.email.earlyListingEnding.extendable;
    expect(mail({ ...ending, period: 1 }).text).toContain(extendable);
    expect(mail({ ...ending, period: 2 }).text).not.toContain(extendable);
  });

  it("a shelter never reads adopter engagement: no report wording in any shelter mail", () => {
    const labels = Object.values(uk.kabinet.email.reportKinds);
    for (const intent of INTENTS.filter((i) => i.audience === "shelter_admins")) {
      const { text, subject } = mail(intent);
      for (const label of labels) expect(`${subject} ${text}`).not.toContain(label);
      expect(`${subject} ${text}`).not.toContain("повідомили");
    }
  });
});

describe("the weekly reminder (F1)", () => {
  const reminder = (staleCards: number) =>
    composeNotification(
      { ...base, kind: "freshnessReminder", audience: "shelter_admins", staleCards },
      "to@example.org",
      CONTEXT,
    );

  it.each([
    [1, "1 картка чекає на підтвердження", "1 картку"],
    [2, "2 картки чекають на підтвердження", "2 картки"],
    [5, "5 карток чекають на підтвердження", "5 карток"],
    [11, "11 карток чекають на підтвердження", "11 карток"],
    [21, "21 картка чекає на підтвердження", "21 картку"],
    [22, "22 картки чекають на підтвердження", "22 картки"],
  ])("with %i cards the subject and the body agree in number", (count, subject, cards) => {
    const email = reminder(count);
    expect(email.subject).toBe(subject);
    expect(email.text).toContain(
      `Добрий день. ${cards} притулку «Лапа» ви не підтверджували щонайменше 14 днів.`,
    );
  });

  it("names the three taps, links to the animal list and says it comes every Monday", () => {
    const { text } = reminder(3);
    expect(text).toContain("«Ще шукає» чи «Ще домовляються»");
    expect(text).toContain("«Уже вдома»");
    expect(text).toContain("https://example.org/kabinet/tvaryny");
    expect(text).toContain(
      "Такий лист приходить щопонеділка, поки є непідтверджені картки. Щоб не отримувати ці листи, дайте відповідь на цей лист.\nОлексій",
    );
  });

  it("tells the shelter how to stop the mail, once, and has no other reply line", () => {
    const { text } = reminder(3);
    expect(text.match(/дайте відповідь на цей лист/g)).toHaveLength(1);
    expect(text).toContain("Щоб не отримувати ці листи, дайте відповідь на цей лист.");
    expect(text).not.toContain("Якщо він вам не потрібен");
  });
});

describe("the body builder", () => {
  it("refuses a link label that looks like a URL", () => {
    expect(() =>
      emailBody("to@example.org", {
        subject: "s",
        before: ["b"],
        link: { label: "https://example.org/kabinet", url: "https://example.org/kabinet" },
        after: [],
      }),
    ).toThrow(/label, never a URL/);
    expect(() =>
      emailBody("to@example.org", {
        subject: "s",
        before: ["b"],
        link: { label: "Відкрити example.org", url: "https://example.org/kabinet" },
        after: [],
      }),
    ).toThrow();
  });
});

describe("the notification copy", () => {
  it("has a Ukrainian string under every key, none pending", () => {
    const walk = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : Object.values(value as Record<string, unknown>).flatMap(walk);
    const strings = [
      uk.kabinet.email.reviewRequested,
      uk.kabinet.email.donationProposed,
      uk.kabinet.email.reportReceived,
      uk.kabinet.email.reportKinds,
      uk.kabinet.email.earlyListingEnding,
      uk.kabinet.email.approved,
      uk.kabinet.email.earlyListingAllowed,
      uk.kabinet.email.donationApproved,
      uk.kabinet.email.donationRejected,
    ].flatMap(walk);
    expect(strings.length).toBeGreaterThan(30);
    for (const text of strings) {
      expect(text).not.toContain(COPY_PENDING);
      expect(text.trim()).not.toBe("");
    }
  });
});
