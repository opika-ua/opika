import { describe, expect, it } from "vitest";
import { HOME_FOUND_PAGE_DAYS, homeFoundPageOf } from "./home-found";
import type { AnimalListingState } from "./listing";

const ADOPTED_AT = new Date("2026-08-01T10:00:00.000Z");
const adopted: AnimalListingState = { kind: "adopted", adoptedAt: ADOPTED_AT };
const after = (days: number, hours = 0) =>
  new Date(ADOPTED_AT.getTime() + days * 86_400_000 + hours * 3_600_000);

describe("homeFoundPageOf", () => {
  it("is 90 days", () => {
    expect(HOME_FOUND_PAGE_DAYS).toBe(90);
  });

  it("shows an adoption from the moment it happens to 89 days 23 hours later", () => {
    expect(homeFoundPageOf(adopted, ADOPTED_AT)).toBe("show");
    expect(homeFoundPageOf(adopted, after(1))).toBe("show");
    expect(homeFoundPageOf(adopted, after(89, 23))).toBe("show");
    expect(homeFoundPageOf(adopted, new Date(after(90).getTime() - 1))).toBe("show");
  });

  it("is gone at exactly 90 days and after", () => {
    expect(homeFoundPageOf(adopted, after(90))).toBe("gone");
    expect(homeFoundPageOf(adopted, after(90, 1))).toBe("gone");
    expect(homeFoundPageOf(adopted, after(400))).toBe("gone");
  });

  it.each<AnimalListingState>([
    { kind: "draft" },
    { kind: "published", publishedAt: ADOPTED_AT, confirmedAt: ADOPTED_AT, undoable: null },
    {
      kind: "reserved",
      since: ADOPTED_AT,
      publishedAt: ADOPTED_AT,
      confirmedAt: ADOPTED_AT,
      undoable: null,
    },
    { kind: "withdrawn", withdrawnAt: ADOPTED_AT, reason: { code: "other", note: null } },
  ])("a $kind listing is never the home-found page", (listing) => {
    expect(homeFoundPageOf(listing, after(1))).toBe("gone");
  });
});
