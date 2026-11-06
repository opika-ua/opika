import { describe, expect, it } from "vitest";
import { type MailDayCounter, type MailVolumeLine, noteMailSent } from "./mail-volume";

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
  it("warns when the UTC day reaches 80 and 100, not before or between", async () => {
    const counter = countingStore();
    const lines: MailVolumeLine[] = [];
    const day = new Date("2026-11-06T10:00:00Z");
    for (let i = 0; i < 100; i++) await noteMailSent(day, counter, (l) => lines.push(l));
    expect(lines.map((l) => l.count)).toEqual([80, 100]);
    expect(lines[0]).toMatchObject({ event: "mail_daily_volume", limit: 100 });
  });

  it("starts a new count on the next UTC day", async () => {
    const counter = countingStore();
    const lines: MailVolumeLine[] = [];
    for (let i = 0; i < 79; i++) await noteMailSent(new Date("2026-11-06T23:59:00Z"), counter);
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
