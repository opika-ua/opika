import type { KabinetShelterView } from "@opika/contracts";
import { cityRepo } from "@opika/db/repos";
import type { CityId } from "@opika/domain";
import { decideAccess } from "../../kabinet/access";
import type { KabinetPrincipal } from "../../kabinet/actor";
import { type ProfileDeps, profileGet } from "../../kabinet/handlers/profile";

/**
 * What `/kabinet` shows to whom (KS-Q1, Oleksii: "A"). Decided by the same
 * access matrix the API applies to `shelter.profile.get` (`decideAccess` with
 * a shelter read), so the page can never show more than the procedure would:
 *
 * - no session: the sign-in page;
 * - a shelter admin: their own shelter;
 * - a support view: the shelter it entered, read-only, with the S5 banner;
 * - anyone else (no role, conflicting roles, a super_admin outside support
 *   mode): not found. The operator's own screens are API only (RG-Q1); a
 *   super_admin sees a shelter's cabinet only by entering support, which is
 *   what makes the viewing visible and time-boxed.
 */
export type KabinetHome =
  | { kind: "sign_in" }
  | { kind: "not_found" }
  | {
      kind: "shelter";
      view: KabinetShelterView;
      /** The premises' city, for the address row; null if the id resolves to nothing. */
      cityName: string | null;
      viewer: "admin" | "support";
    };

export async function kabinetHomeOf(
  principal: KabinetPrincipal,
  deps: ProfileDeps,
): Promise<KabinetHome> {
  const access = decideAccess({ surface: "shelter", mode: "read" }, principal);
  if (access.kind === "deny") {
    return access.code === "UNAUTHENTICATED" ? { kind: "sign_in" } : { kind: "not_found" };
  }
  if (access.kind !== "allow_shelter_read") return { kind: "not_found" };
  const view = await profileGet(deps, access.scope);
  // A city is public data (it names the card's location), not something the
  // shelter view withholds; the view carries only its id.
  const city = await cityRepo(deps.db).findById(view.exactAddress.cityId as CityId);
  return {
    kind: "shelter",
    view,
    cityName: city?.name.uk ?? null,
    viewer: access.scope.kind === "support_view" ? "support" : "admin",
  };
}
