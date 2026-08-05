import { ContactRevealSchema } from "@opika/domain";
import type { z } from "zod";

/**
 * The reveal crosses to the client whole, snapshot included — this is the one
 * place a shelter's exact address and contact details legitimately reach an
 * adopter, and only because they asked for it.
 *
 * The snapshot rather than the live shelter, so the record keeps showing what
 * the adopter was actually told.
 */
export const ContactRevealViewSchema = ContactRevealSchema.pick({
  id: true,
  animalId: true,
  revealedAt: true,
  shelterSnapshot: true,
  animalSnapshot: true,
});
export type ContactRevealView = z.infer<typeof ContactRevealViewSchema>;
