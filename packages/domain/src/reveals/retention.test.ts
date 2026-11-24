import { describe, expect, it } from "vitest";
import { REVEAL_RETENTION_DAYS, revealRetentionCutoff } from "./retention";

const NOW = new Date("2026-11-20T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
// The clean-up's SQL rule (`revealRepo.deleteExpired`): strictly before the cutoff.
const due = (revealedAt: Date) => revealedAt.getTime() < revealRetentionCutoff(NOW).getTime();

describe("reveal retention", () => {
  it("is 90 days (a literal, so a changed window fails here and the policy text is revisited)", () => {
    expect(REVEAL_RETENTION_DAYS).toBe(90);
    expect(revealRetentionCutoff(NOW)).toEqual(ago(90 * DAY));
  });

  it("puts a reveal exactly 90 days old on the cutoff (kept) and one a millisecond older past it", () => {
    expect(due(ago(90 * DAY))).toBe(false);
    expect(due(ago(90 * DAY + 1))).toBe(true);
  });

  it("keeps a young reveal", () => {
    expect(due(ago(DAY))).toBe(false);
    expect(due(NOW)).toBe(false);
  });
});
