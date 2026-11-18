import type { apiErrors, KabinetShelterView } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { ShelterWriteScope } from "../access";
import type { ProfileDeps } from "./profile";

type CasErrors = ORPCErrorConstructorMap<{ CONFLICT: typeof apiErrors.CONFLICT }>;

/**
 * `shelter.profile.updateIdentity` (§4): typed in Phase 0, served by the editability PR (Agent 3).
 * A rename writes `display_name_changed` with the shelter admin as actor (D4); a city change moves
 * the animals that follow the shelter's city, as the operator's address change does (P0-5).
 */
export async function profileUpdateIdentity(
  _deps: ProfileDeps,
  _scope: ShelterWriteScope,
  _input: {
    displayName?: string | undefined;
    cityId?: CityId | undefined;
    expectedVersion: number;
  },
  _errors: CasErrors,
): Promise<KabinetShelterView> {
  throw new Error("shelter.profile.updateIdentity is not served yet");
}
