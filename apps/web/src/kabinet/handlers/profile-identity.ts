import { type apiErrors, type KabinetShelterView, UNKNOWN_CITY_MESSAGE } from "@opika/contracts";
import {
  type AuditedShelterChange,
  cityRepo,
  kabinetShelterRepo,
  shelterRepo,
} from "@opika/db/repos";
import {
  type CityId,
  cityPublicLocationOf,
  type Shelter,
  type ShelterHistoryEntry,
} from "@opika/domain";
import { ORPCError, type ORPCErrorConstructorMap } from "@orpc/server";
import { isSelfRegistrationEnabled } from "../../features/registration/flag";
import type { ShelterWriteScope } from "../access";
import { handOver } from "../notify/hand-over";
import { actorOf, type ProfileDeps, profileGet } from "./profile";

type IdentityErrors = ORPCErrorConstructorMap<{
  CONFLICT: typeof apiErrors.CONFLICT;
  CITY_LOCKED: typeof apiErrors.CITY_LOCKED;
}>;

type Identity = { displayName?: string | undefined; cityId?: CityId | undefined };

/** What changed, as audited changes with their history lines, in the order sent. */
function planOf(
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  shelter: Shelter,
  input: Identity,
): { changes: AuditedShelterChange[]; entries: ShelterHistoryEntry[] } {
  const changes: AuditedShelterChange[] = [];
  const entries: ShelterHistoryEntry[] = [];
  const actor = actorOf(scope);
  if (input.displayName !== undefined && input.displayName !== shelter.displayName) {
    changes.push({ kind: "display_name", displayName: input.displayName });
    entries.push({
      kind: "display_name_changed",
      at: deps.now,
      actor,
      from: shelter.displayName,
      to: input.displayName,
    });
  }
  const from = shelter.publicLocation.cityId;
  if (input.cityId !== undefined && input.cityId !== from) {
    // City precision, no district: a district belongs to an address, and the address is the operator's.
    changes.push({ kind: "city", publicLocation: cityPublicLocationOf(input.cityId, null) });
    entries.push({ kind: "city_changed", at: deps.now, actor, from, to: input.cityId });
  }
  return { changes, entries };
}

/**
 * `shelter.profile.updateIdentity` (§4): the name and the base city, instant and logged with the
 * shelter admin as actor (D4). Both land as one compare-and-set write with their history lines;
 * a city move carries the animals that follow the shelter's city in the same statement (P0-5).
 */
export async function profileUpdateIdentity(
  deps: ProfileDeps,
  scope: ShelterWriteScope,
  input: Identity & { expectedVersion: number },
  errors: IdentityErrors,
): Promise<KabinetShelterView> {
  // Behind the flag like the rest of self-registration: off, it answers as the Phase 0 stub did.
  if (!isSelfRegistrationEnabled()) {
    throw new Error("shelter.profile.updateIdentity is not served yet");
  }
  if (
    input.cityId !== undefined &&
    (await cityRepo(deps.db).findCurrentById(input.cityId)) === null
  ) {
    // As the operator's address change: a client fault, 400, never the FK's 500.
    throw new ORPCError("BAD_REQUEST", { status: 400, message: UNKNOWN_CITY_MESSAGE });
  }
  const shelter = await shelterRepo(deps.db).findById(scope.shelterId);
  if (shelter === null) throw new Error(`Scope names missing shelter ${scope.shelterId}`);
  if (shelter.version !== input.expectedVersion) throw errors.CONFLICT();
  // Recorded premises (an address or foster homes) fix the city: only the operator moves it, so the
  // whole request is refused (owner, 2026-11-18; D4, 2026-11-24). A record since the read conflicts.
  if (
    input.cityId !== undefined &&
    input.cityId !== shelter.publicLocation.cityId &&
    shelter.premises.kind !== "not_recorded"
  ) {
    throw errors.CITY_LOCKED();
  }
  const { changes, entries } = planOf(deps, scope, shelter, input);
  if (changes.length === 0) return profileGet(deps, scope);
  const lines = entries.map((entry) => ({ id: deps.newId(), entry }));
  const result = await kabinetShelterRepo(deps.db).applyAuditedMany({
    shelterId: shelter.id,
    expectedVersion: input.expectedVersion,
    changes,
    entries: lines,
    now: deps.now,
  });
  if (result.kind === "conflict") throw errors.CONFLICT();
  handOver(deps.notify, shelter, lines);
  return profileGet(deps, scope);
}
