import { z } from "zod";
import type { LocationPrivacyPolicy } from "../primitives/coordinates";
import type { ShelterId } from "../primitives/ids";
import type { ShelterLegalEntity } from "./legal-entity";
import {
  cityPublicLocationOf,
  type ExactAddress,
  ExactAddressSchema,
  type PublicLocation,
  publicLocationOf,
} from "./location";

/**
 * Where the animals live. Set by the operator at review; never a foster carer's address (standing
 * constraint). `not_recorded` is "not filled in yet", kept apart from `foster_homes` ("has no
 * premises"), so approval can ask for one or the other (owner, 2026-11-24, D2).
 */
export const ShelterPremisesSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not_recorded") }),
  z.object({ kind: z.literal("address"), address: ExactAddressSchema }),
  /** Initiatives only (D3): the animals live in foster homes, and no address is stored. */
  z.object({ kind: z.literal("foster_homes") }),
]);
export type ShelterPremises = z.infer<typeof ShelterPremisesSchema>;

/** What the operator can record: never back to `not_recorded`. */
export const RecordedPremisesSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("address"), address: ExactAddressSchema }),
  z.object({ kind: z.literal("foster_homes") }),
]);
export type RecordedPremises = z.infer<typeof RecordedPremisesSchema>;

export const NOT_RECORDED: ShelterPremises = { kind: "not_recorded" };

/** The premises address, or null: today's address readers, unchanged. */
export const exactAddressOf = (premises: ShelterPremises): ExactAddress | null =>
  premises.kind === "address" ? premises.address : null;

/** A stored address as premises; none on file is `not_recorded`. */
export const premisesOfAddress = (address: ExactAddress | null): ShelterPremises =>
  address === null ? NOT_RECORDED : { kind: "address", address };

/** Only an initiative may say its animals live in foster homes (D3). */
export const mayUseFosterHomes = (legalEntity: ShelterLegalEntity | null): boolean =>
  legalEntity?.kind === "unregistered_initiative";

/**
 * The operator's premises edit: foster homes need an initiative (D3). The database holds the same
 * rule (`shelters_foster_homes_initiative_only`).
 */
export const premisesEditRefusalOf = (
  legalEntity: ShelterLegalEntity | null,
  next: RecordedPremises,
): "foster_homes_need_initiative" | null =>
  next.kind === "foster_homes" && !mayUseFosterHomes(legalEntity)
    ? "foster_homes_need_initiative"
    : null;

/**
 * The operator's legal-form edit: leaving the initiative form while the premises are foster homes
 * waits for an address first (D5, `PREMISES_NEEDS_ADDRESS`).
 */
export const legalEntityEditRefusalOf = (
  premises: ShelterPremises,
  next: ShelterLegalEntity,
): "premises_needs_address" | null =>
  premises.kind === "foster_homes" && !mayUseFosterHomes(next) ? "premises_needs_address" : null;

/**
 * The public location the premises give: an address through `publicLocationOf` (the one
 * sanctioned fuzzing path), foster homes as the city alone with no district and no pin.
 */
export const premisesPublicLocationOf = (
  shelterId: ShelterId,
  premises: RecordedPremises,
  cityId: PublicLocation["cityId"],
  policy: LocationPrivacyPolicy,
): PublicLocation =>
  premises.kind === "address"
    ? publicLocationOf(shelterId, premises.address, policy)
    : cityPublicLocationOf(cityId, null);
