import { z } from "zod";
import { EdrpouSchema } from "../primitives/ids";

/**
 * `unregistered_initiative` exists because a large share of shelter activity in
 * the target oblast is unincorporated volunteer groups. Modelling only
 * registered entities would exclude them from the product at the type level,
 * which is a product decision disguised as a schema.
 *
 * Whether such a group can reach `verified` is a policy question answered in
 * verification/policy.ts, not a structural one answered here.
 */
export const ShelterLegalEntitySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("registered_ngo"),
    legalName: z.string().min(1),
    edrpou: EdrpouSchema,
    registeredAt: z.date(),
  }),
  z.object({
    kind: z.literal("sole_proprietor"),
    legalName: z.string().min(1),
    edrpou: EdrpouSchema,
  }),
  z.object({
    kind: z.literal("unregistered_initiative"),
    contactPersonName: z.string().min(1),
  }),
]);
export type ShelterLegalEntity = z.infer<typeof ShelterLegalEntitySchema>;

/**
 * The noun public pages use for the organisation (owner, 2026-11-24): an unregistered group is an
 * «ініціатива», not a «притулок». A form not chosen yet keeps «притулок» (D1). The only legal fact
 * that leaves the server.
 */
export const ORGANISATION_WORDS = ["shelter", "initiative"] as const;
export const OrganisationWordSchema = z.enum(ORGANISATION_WORDS);
export type OrganisationWord = z.infer<typeof OrganisationWordSchema>;

export const organisationWordOf = (kind: ShelterLegalEntity["kind"] | null): OrganisationWord =>
  kind === "unregistered_initiative" ? "initiative" : "shelter";
