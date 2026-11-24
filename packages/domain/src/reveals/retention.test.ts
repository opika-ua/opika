import { describe, expect, it } from "vitest";
import { REVEAL_RETENTION_DAYS, revealRetentionCutoff } from "./retention";

const NOW = new Date("2026-11-20T03:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

// The boundary (exactly 90 days kept, a millisecond older deleted) is pinned against the real
// query in packages/db/test/adopter-cleanup.test.ts, not re-implemented here.
describe("reveal retention", () => {
  it("is 90 days (a literal, so a changed window fails here and the policy text is revisited)", () => {
    expect(REVEAL_RETENTION_DAYS).toBe(90);
    expect(revealRetentionCutoff(NOW)).toEqual(new Date(NOW.getTime() - 90 * DAY));
  });
});
