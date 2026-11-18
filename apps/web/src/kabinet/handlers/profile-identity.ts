import type { apiErrors, KabinetShelterView } from "@opika/contracts";
import type { CityId } from "@opika/domain";
import type { ORPCErrorConstructorMap } from "@orpc/server";
import type { ShelterWriteScope } from "../access";
import { actorOf, editFromForm, type Planned, type ProfileDeps } from "./profile";

type CasErrors = ORPCErrorConstructorMap<{ CONFLICT: typeof apiErrors.CONFLICT }>;

/**
 * `shelter.profile.updateIdentity` (§4): a rename is instant and logged with the shelter admin as
 * actor (D4), compare-and-set on the version the form read. A city change is refused loudly, never
 * dropped: no history entry records a shelter's own city change yet (an open question).
 */
export async function profileUpdateIdentity(
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  input: {
    displayName?: string | undefined;
    cityId?: CityId | undefined;
    expectedVersion: number;
  },
  errors: CasErrors,
): Promise<KabinetShelterView> {
  return editFromForm(
    deps,
    scope,
    input.expectedVersion,
    (shelter): Planned => {
      if (input.cityId !== undefined && input.cityId !== shelter.publicLocation.cityId) {
        throw new Error("shelter city edits are not served yet");
      }
      if (input.displayName === undefined || input.displayName === shelter.displayName) {
        return { kind: "no_change" };
      }
      return {
        kind: "write",
        change: { kind: "display_name", displayName: input.displayName },
        entry: {
          kind: "display_name_changed",
          at: deps.now,
          actor: actorOf(scope),
          from: shelter.displayName,
          to: input.displayName,
        },
      };
    },
    errors,
  );
}
