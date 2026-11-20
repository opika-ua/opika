import { describe, expect, it } from "vitest";
import {
  MAIL_DAILY_CRITICAL_AT,
  MAIL_DAILY_WARN_AT,
  type MailDayCounter,
  type MailVolumeLine,
  noteMailSent,
} from "./mail-volume";

function countingStore(): MailDayCounter {
  const counts = new Map<string, number>();
  return {
    async increment(day) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
      return counts.get(day) as number;
    },
  };
}

describe("noteMailSent", () => {
  it("warns when the UTC day reaches 1,000 and 1,500, not before or between", async () => {
    const counter = countingStore();
    const lines: MailVolumeLine[] = [];
    const day = new Date("2026-11-06T10:00:00Z");
    for (let i = 0; i < MAIL_DAILY_CRITICAL_AT; i++)
      await noteMailSent(day, counter, (l) => lines.push(l));
    expect(lines.map((l) => l.count)).toEqual([1000, 1500]);
    expect(lines[0]).toMatchObject({ event: "mail_daily_volume", warnAt: 1000, criticalAt: 1500 });
  });

  it("starts a new count on the next UTC day", async () => {
    const counter = countingStore();
    const lines: MailVolumeLine[] = [];
    for (let i = 0; i < MAIL_DAILY_WARN_AT - 1; i++)
      await noteMailSent(new Date("2026-11-06T23:59:00Z"), counter);
    await noteMailSent(new Date("2026-11-07T00:00:00Z"), counter, (l) => lines.push(l));
    expect(lines).toEqual([]);
  });

  it("swallows a counter failure", async () => {
    const broken: MailDayCounter = {
      increment: async () => {
        throw new Error("store down");
      },
    };
    await expect(noteMailSent(new Date(), broken)).resolves.toBeUndefined();
  });
});
