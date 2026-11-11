import { EARLY_LISTING_DAYS, type Shelter, type ShelterHistoryEntry } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { dedupKeyOf, userHashOf } from "./dedup";
import { type HistoryLine, planEarlyListingEnding, planEventIntents } from "./intents";

/** The planners are pure: who gets which mail, decided from the history lines and nothing else. */

const NOW = new Date("2026-11-10T06:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const MODERATOR = "0ec0ec0e-0000-4000-8000-000000000001";
const SHELTER = {
  id: "11111111-1111-4111-8111-111111111111",
  displayName: "Лапа",
  verification: { status: "under_review" },
} as unknown as Parameters<typeof planEventIntents>[0];
const asAdmin = { kind: "shelter_admin", shelterAdminId: "a1" } as const;
const asModerator = { kind: "moderator", moderatorId: MODERATOR } as const;
const LINK = { url: "https://donate.example.org/jar/abc?utm=x", provider: "other" } as const;

const line = (id: string, entry: unknown): HistoryLine => ({
  id,
  entry: entry as ShelterHistoryEntry,
});
const verification = (event: object) =>
  line("h1", { kind: "verification", event: { at: NOW, ...event }, from: "x", to: "y" });
const allowed = (id: string) =>
  line(id, {
    kind: "early_listing_allowed",
    at: NOW,
    moderatorId: MODERATOR,
    period: 1,
    note: null,
  });

describe("planEventIntents", () => {
  it("approve is S1 for the shelter's admins", () => {
    expect(planEventIntents(SHELTER, [verification({ type: "approve" })])).toMatchObject([
      { kind: "approved", audience: "shelter_admins", shelterName: "Лапа", dedupBase: "h:h1" },
    ]);
  });

  it("reinstate is not an approval and sends nothing", () => {
    expect(planEventIntents(SHELTER, [verification({ type: "reinstate" })])).toEqual([]);
  });

  it("a shelter admin's resubmit is O1 for the operators", () => {
    expect(
      planEventIntents(SHELTER, [verification({ type: "resubmit", actor: asAdmin })]),
    ).toMatchObject([{ kind: "reviewRequested", audience: "operators" }]);
  });

  it("the operator's own resubmit mails nobody", () => {
    expect(
      planEventIntents(SHELTER, [verification({ type: "resubmit", actor: asModerator })]),
    ).toEqual([]);
  });

  it("the other verification moves send nothing", () => {
    for (const type of ["start_review", "reject", "suspend", "pause", "resume"]) {
      expect(planEventIntents(SHELTER, [verification({ type, actor: asAdmin })])).toEqual([]);
    }
  });

  it("a donation link proposed by the shelter is O2, naming the host and no more", () => {
    const [intent] = planEventIntents(SHELTER, [
      line("h2", { kind: "donation_proposed", at: NOW, actor: asAdmin, link: LINK }),
    ]);
    expect(intent).toMatchObject({
      kind: "donationProposed",
      audience: "operators",
      host: "donate.example.org",
    });
    expect(JSON.stringify(intent)).not.toContain("utm");
  });

  it("a proposal made by the operator is not mailed to the operator", () => {
    expect(
      planEventIntents(SHELTER, [
        line("h2", { kind: "donation_proposed", at: NOW, actor: asModerator, link: LINK }),
      ]),
    ).toEqual([]);
  });

  it("early listing allowed is S2, ending 60 days after the line", () => {
    const [intent] = planEventIntents(SHELTER, [allowed("h3")]);
    expect(intent).toMatchObject({ kind: "earlyListingAllowed", audience: "shelter_admins" });
    expect(intent && "expiresAt" in intent && intent.expiresAt.getTime()).toBe(
      NOW.getTime() + EARLY_LISTING_DAYS * DAY,
    );
  });

  const decided = (decision: "approved" | "rejected") =>
    line("h4", {
      kind: "donation_decided",
      at: NOW,
      moderatorId: MODERATOR,
      decision,
      link: LINK,
      previousLive: null,
    });

  it("an approved link is S3, shown now only while the shelter is verified or paused", () => {
    const shownNow = (status: string) => {
      const [intent] = planEventIntents(
        { ...SHELTER, verification: { status } } as typeof SHELTER,
        [decided("approved")],
      );
      return intent?.kind === "donationApproved" ? intent.shownNow : undefined;
    };
    expect(shownNow("verified")).toBe(true);
    expect(shownNow("paused")).toBe(true);
    expect(shownNow("under_review")).toBe(false);
    expect(shownNow("pending")).toBe(false);
  });

  it("a rejected link is S4 for the admins", () => {
    expect(planEventIntents(SHELTER, [decided("rejected")])).toMatchObject([
      { kind: "donationRejected", audience: "shelter_admins", host: "donate.example.org" },
    ]);
  });

  it("history that is not an event mail plans nothing, and no lines plan nothing", () => {
    expect(
      planEventIntents(SHELTER, [
        line("h5", {
          kind: "contact_changed",
          at: NOW,
          actor: asAdmin,
          previous: null,
          next: null,
        }),
        line("h6", { kind: "early_listing_revoked", at: NOW, moderatorId: MODERATOR }),
        line("h7", { kind: "donation_removed", at: NOW, moderatorId: MODERATOR }),
      ]),
    ).toEqual([]);
    expect(planEventIntents(SHELTER, [])).toEqual([]);
  });

  it("each line keeps its own history id as the dedup base", () => {
    const intents = planEventIntents(SHELTER, [allowed("a"), verification({ type: "approve" })]);
    expect(intents.map((i) => i.dedupBase)).toEqual(["h:a", "h:h1"]);
  });
});

describe("planEarlyListingEnding (O4)", () => {
  const SHELTER_ID = "22222222-2222-4222-8222-222222222222";
  const shelter = (since: Date | null, status = "under_review") =>
    ({
      id: SHELTER_ID,
      displayName: "Лапа",
      verification: { status },
      earlyListingSince: since,
    }) as unknown as Shelter;
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

  it("plans a mail when 7 days or fewer are left, keyed on the period's start", () => {
    const since = ago(EARLY_LISTING_DAYS - 7);
    const intent = planEarlyListingEnding(shelter(since), 1, NOW);
    expect(intent).toMatchObject({ kind: "earlyListingEnding", audience: "operators", period: 1 });
    expect(intent?.dedupBase).toBe(`el-end:${SHELTER_ID}:${since.toISOString()}`);
  });

  it("plans nothing with more than 7 days left, after expiry, without a permission or once verified", () => {
    expect(planEarlyListingEnding(shelter(ago(EARLY_LISTING_DAYS - 8)), 1, NOW)).toBeNull();
    expect(planEarlyListingEnding(shelter(ago(EARLY_LISTING_DAYS)), 1, NOW)).toBeNull();
    expect(planEarlyListingEnding(shelter(null), 1, NOW)).toBeNull();
    expect(planEarlyListingEnding(shelter(ago(55), "verified"), 1, NOW)).toBeNull();
    expect(planEarlyListingEnding(shelter(ago(55), "rejected"), 1, NOW)).toBeNull();
  });

  it("a second period is a different key and reports period 2", () => {
    const first = planEarlyListingEnding(shelter(ago(55)), 1, NOW);
    const second = planEarlyListingEnding(shelter(ago(54)), 2, NOW);
    expect(second?.kind === "earlyListingEnding" && second.period).toBe(2);
    expect(second?.dedupBase).not.toBe(first?.dedupBase);
  });

  it("is the same key on every day of the same period", () => {
    const since = ago(55);
    const today = planEarlyListingEnding(shelter(since), 1, NOW);
    const tomorrow = planEarlyListingEnding(shelter(since), 1, new Date(NOW.getTime() + DAY));
    expect(tomorrow?.dedupBase).toBe(today?.dedupBase);
  });
});

describe("dedupKeyOf", () => {
  const USER = "6f1c2c9e-3d5a-4b7e-9a10-aaaaaaaaaaaa";

  it("carries a hash of the user id and never the id", () => {
    const key = dedupKeyOf("h:abc", USER);
    expect(key).toBe(`h:abc:${userHashOf(USER)}`);
    expect(key).not.toContain(USER);
    expect(userHashOf(USER)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("differs per recipient and is stable for one", () => {
    expect(dedupKeyOf("h:abc", USER)).toBe(dedupKeyOf("h:abc", USER));
    expect(dedupKeyOf("h:abc", USER)).not.toBe(dedupKeyOf("h:abc", `${USER}x`));
  });
});
