import type { ShelterHistoryItemView } from "@opika/contracts";
import { describe, expect, it } from "vitest";
import { latestDonationOutcomeOf } from "./donation-outcome";

const at = new Date("2026-10-01T00:00:00Z");
const shelter = { kind: "shelter" } as const;
const operator = { kind: "operator", displayName: "Олексій" } as const;
const link = { url: "https://dobro.ua/x", provider: "other" } as const;

const proposed: ShelterHistoryItemView = { kind: "donation_proposed", at, actor: shelter, link };
const cancelled: ShelterHistoryItemView = {
  kind: "donation_proposal_cancelled",
  at,
  actor: shelter,
};
const decided = (decision: "approved" | "rejected"): ShelterHistoryItemView => ({
  kind: "donation_decided",
  at,
  actor: operator,
  decision,
  link,
  previousLive: null,
});
const other: ShelterHistoryItemView = {
  kind: "animal_created",
  at,
  actor: shelter,
  animalName: "Рекс",
};

const removed: ShelterHistoryItemView = {
  kind: "donation_removed",
  at,
  actor: operator,
  previousLive: link,
  clearedPending: false,
  reason: { code: "other", note: "Пояснення" },
};
const suspended: ShelterHistoryItemView = {
  kind: "donation_suspended",
  at,
  actor: operator,
  previousLive: link,
  outcome: "moved_to_pending",
};

describe("removal and suspension lines", () => {
  it("a removal on top says so, with the reason as written", () => {
    expect(latestDonationOutcomeOf([removed, decided("approved")])).toEqual({
      kind: "removed",
      reason: { code: "other", note: "Пояснення" },
    });
  });

  it("a suspension on top says so", () => {
    expect(latestDonationOutcomeOf([suspended, decided("rejected")])).toEqual({
      kind: "suspended",
    });
  });

  it("a newer proposal wipes either message", () => {
    expect(latestDonationOutcomeOf([proposed, removed])).toEqual({ kind: "none" });
    expect(latestDonationOutcomeOf([proposed, suspended])).toEqual({ kind: "none" });
  });
});

describe("latestDonationOutcomeOf (answer 12)", () => {
  it("declined when the newest donation line is a rejection, other lines above it or not", () => {
    expect(latestDonationOutcomeOf([other, decided("rejected"), proposed])).toEqual({
      kind: "declined",
    });
  });

  it("nothing once a newer proposal or cancellation sits on top, or after an approval", () => {
    expect(latestDonationOutcomeOf([proposed, decided("rejected")])).toEqual({ kind: "none" });
    expect(latestDonationOutcomeOf([cancelled, decided("rejected")])).toEqual({ kind: "none" });
    expect(latestDonationOutcomeOf([decided("approved"), decided("rejected")])).toEqual({
      kind: "none",
    });
  });

  /** R-UI 4: the operator renaming the shelter is not an answer about its link. */
  it("a rename on top leaves the declined message as it was", () => {
    const renamed: ShelterHistoryItemView = {
      kind: "display_name_changed",
      at,
      actor: operator,
      from: "Лапа",
      to: "Лапа допомоги",
    };
    expect(latestDonationOutcomeOf([renamed, decided("rejected")])).toEqual({ kind: "declined" });
  });

  it("null when these lines hold no donation line (read further)", () => {
    expect(latestDonationOutcomeOf([other])).toBeNull();
    expect(latestDonationOutcomeOf([])).toBeNull();
  });
});
