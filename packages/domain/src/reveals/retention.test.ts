import { describe, expect, it } from "vitest";
import { isRevealExpired, REVEAL_RETENTION_DAYS, revealRetentionCutoff } from "./retention";

const NOW = new Date("2026-11-20T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("reveal retention", () => {
  it("is 90 days (a literal, so a changed window fails here and the policy text is revisited)", () => {
    expect(REVEAL_RETENTION_DAYS).toBe(90);
    expect(revealRetentionCutoff(NOW)).toEqual(ago(90 * DAY));
  });

  it("keeps a reveal exactly 90 days old and deletes one a millisecond older", () => {
    expect(isRevealExpired(ago(90 * DAY), NOW)).toBe(false);
    expect(isRevealExpired(ago(90 * DAY + 1), NOW)).toBe(true);
  });

  it("keeps a young reveal", () => {
    expect(isRevealExpired(ago(DAY), NOW)).toBe(false);
    expect(isRevealExpired(NOW, NOW)).toBe(false);
  });
});
