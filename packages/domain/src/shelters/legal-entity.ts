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
