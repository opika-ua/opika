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
