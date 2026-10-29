import type { ModeratorId, ShelterAdminId, ShelterId } from "@opika/domain";
import { describe, expect, it } from "vitest";
import { operatorCreatePageOf } from "../features/kabinet/operator/create/create-page";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";

/**
 * Who gets S2, `/kabinet/prytulky/novyi` (R-UI 2, plan §4): exactly who may
 * call `registry.shelters.create`, by the registry router's own access check
 * on that procedure, and no database (the form loads no city). The page
 * turns `sign_in` into the sign-in redirect and `not_found` into `notFound()`;
 * its 404s while sign-in is unavailable or without the location key are
 * `app/kabinet/available-auth.test.ts`'s.
 */

const OPERATOR = "0ec0ec0e-0000-4000-8000-000000000001" as ModeratorId;
const SHELTER = "51000000-0000-4000-8000-000000000001" as ShelterId;
const deps = (shelterWrites = SHELTER_WRITE_POLICY) => ({ shelterWrites });

describe("S2 /kabinet/prytulky/novyi: who gets the create form", () => {
  it("gives a super_admin outside support mode the form, and loads no city", async () => {
    expect(
      await operatorCreatePageOf({ kind: "super_admin", moderatorId: OPERATOR }, deps()),
    ).toEqual({ kind: "create" });
  });

  it("sends an anonymous visitor to sign in", async () => {
    expect(await operatorCreatePageOf({ kind: "anonymous" }, deps())).toEqual({
      kind: "sign_in",
    });
  });

  it.each<[string, KabinetPrincipal]>([
    [
      "a shelter admin",
      {
        kind: "shelter_admin",
        shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
        shelterId: SHELTER,
      },
    ],
    [
      "the operator in support mode",
      { kind: "support_view", moderatorId: OPERATOR, shelterId: SHELTER },
    ],
    ["an account with no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
  ])("shows %s nothing (not found)", async (_who, principal) => {
    expect(await operatorCreatePageOf(principal, deps())).toEqual({ kind: "not_found" });
  });

  it("is the operator's, and a shelter admin with open writes gets nothing", async () => {
    const open = deps();
    expect(
      (await operatorCreatePageOf({ kind: "super_admin", moderatorId: OPERATOR }, open)).kind,
    ).toBe("create");
    expect(
      await operatorCreatePageOf(
        {
          kind: "shelter_admin",
          shelterAdminId: "33333333-3333-4333-8333-333333333333" as ShelterAdminId,
          shelterId: SHELTER,
        },
        open,
      ),
    ).toEqual({ kind: "not_found" });
  });
});
