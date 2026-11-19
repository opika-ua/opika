import type { KabinetShelterView } from "@opika/contracts";
import { describe, expect, it } from "vitest";
import { publishGateFor } from "./application-banners";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const CONTACT: KabinetShelterView["contact"] = {
  primary: { kind: "phone", e164: "+380671234567" },
  additional: [],
};
const APPLICATION: KabinetShelterView["verification"] = {
  status: "application",
  since: NOW,
};
const PENDING: KabinetShelterView["verification"] = {
  status: "pending",
  since: NOW,
};

/** The kabinet's copy of the server's `publishGateOf`: the same answer, in the same order. */
describe("publishGateFor", () => {
  it("application / no contact / both / neither", () => {
    expect(publishGateFor({ verification: APPLICATION, contact: CONTACT })).toEqual({
      kind: "blocked",
      why: "application",
    });
    expect(publishGateFor({ verification: PENDING, contact: null })).toEqual({
      kind: "blocked",
      why: "no_contact",
    });
    expect(publishGateFor({ verification: APPLICATION, contact: null })).toEqual({
      kind: "blocked",
      why: "application",
    });
    expect(publishGateFor({ verification: PENDING, contact: CONTACT })).toEqual({ kind: "open" });
  });
});
