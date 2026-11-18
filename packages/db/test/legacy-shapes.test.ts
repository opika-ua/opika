import type { ModeratorId, ShelterHistoryEntry, ShelterVerification } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { withRejectionStage, withRenameActor } from "../src/schema/legacy-shapes";

const AT = new Date("2026-11-01T00:00:00.000Z");
const MOD = "11111111-1111-4111-8111-111111111111" as ModeratorId;
const EVIDENCE = { items: [], submittedAt: AT };

describe("withRejectionStage (a rejection written before 0028)", () => {
  it("reads a stage-less rejection as refusing a verification", () => {
    const old = {
      status: "rejected",
      rejectedAt: AT,
      rejectedBy: MOD,
      reason: { code: "spam", note: null },
      evidence: EVIDENCE,
    } as unknown as ShelterVerification;
    expect(withRejectionStage(old)).toEqual({ ...old, stage: "verification" });
  });

  it("keeps a stage that is there, and leaves every other status alone", () => {
    const refused: ShelterVerification = {
      status: "rejected",
      rejectedAt: AT,
      rejectedBy: MOD,
      reason: { code: "spam", note: null },
      stage: "application",
      evidence: EVIDENCE,
    };
    const pending: ShelterVerification = { status: "pending", submittedAt: AT, evidence: EVIDENCE };
    expect(withRejectionStage(refused)).toBe(refused);
    expect(withRejectionStage(pending)).toBe(pending);
  });
});

describe("withRenameActor (a rename line written before 0028)", () => {
  it("reads a bare moderator id as the operator's actor", () => {
    const old = {
      kind: "display_name_changed",
      at: AT,
      moderatorId: MOD,
      from: "Лапа",
      to: "Лапа допомоги",
    } as unknown as ShelterHistoryEntry;
    expect(withRenameActor(old)).toEqual({
      kind: "display_name_changed",
      at: AT,
      actor: { kind: "moderator", moderatorId: MOD },
      from: "Лапа",
      to: "Лапа допомоги",
    });
  });

  it("keeps a line that has an actor, and leaves every other kind alone", () => {
    const renamed: ShelterHistoryEntry = {
      kind: "display_name_changed",
      at: AT,
      actor: { kind: "moderator", moderatorId: MOD },
      from: "Лапа",
      to: "Лапа допомоги",
    };
    const created: ShelterHistoryEntry = {
      kind: "shelter_created",
      at: AT,
      moderatorId: MOD,
      via: "registry",
    };
    expect(withRenameActor(renamed)).toBe(renamed);
    expect(withRenameActor(created)).toBe(created);
  });
});
