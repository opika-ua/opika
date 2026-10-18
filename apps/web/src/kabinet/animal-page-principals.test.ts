import { describe, expect, it, vi } from "vitest";
import type { KabinetHomeDeps } from "../features/kabinet/home";
import { SHELTER_WRITE_POLICY } from "./access";
import type { KabinetPrincipal } from "./actor";

/**
 * Review finding 5 (K3): `kabinetAnimalPageOf` answers not found to every
 * principal but a shelter admin and a support view before it asks the router
 * anything. The router's access middleware refuses them too, which is what
 * `animal-page.test.ts` sees end to end, so there the page's own check could
 * be deleted with every test still green. Here the two procedures the page
 * reads are replaced by ones that answer anyone, so the page's check is the
 * only thing between those principals and the form.
 */
const fakes = vi.hoisted(() => ({
  shelter: { verification: { status: "verified" } },
  animal: { id: "a1000000-0000-4000-8000-000000000001" },
}));

vi.mock("./router", async () => {
  const { os } = await import("@orpc/server");
  return {
    shelterKabinetRouter: {
      shelter: {
        profile: { get: os.handler(async () => fakes.shelter) },
        animals: { byId: os.handler(async () => fakes.animal) },
      },
    },
  };
});

const { kabinetAnimalPageOf } = await import("../features/kabinet/animal-page");

const deps = { shelterWrites: SHELTER_WRITE_POLICY } as unknown as KabinetHomeDeps;
const EXISTING = { kind: "existing", animalId: fakes.animal.id } as const;

describe("kabinetAnimalPageOf refuses other principals on its own (defence in depth)", () => {
  it("sanity: the stand-in router answers, so a shelter admin reaches the form", async () => {
    const admin: KabinetPrincipal = {
      kind: "shelter_admin",
      shelterAdminId: "33333333-3333-4333-8333-333333333333",
      shelterId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    } as KabinetPrincipal;
    expect(await kabinetAnimalPageOf(admin, EXISTING, deps)).toMatchObject({
      kind: "form",
      viewer: "admin",
    });
  });

  it.each([
    ["no role", { kind: "no_role" }],
    ["conflicting roles", { kind: "conflicting_roles" }],
    [
      "a super_admin outside support mode",
      { kind: "super_admin", moderatorId: "0ec0ec0e-0000-4000-8000-000000000001" },
    ],
  ] as [string, KabinetPrincipal][])(
    "%s gets not found even when the router would answer",
    async (_who, principal) => {
      for (const target of [{ kind: "new" } as const, EXISTING]) {
        expect(await kabinetAnimalPageOf(principal, target, deps)).toEqual({ kind: "not_found" });
      }
    },
  );
});
