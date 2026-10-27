import { z } from "zod";

/**
 * A storage key, never a URL - same reasoning as `AnimalPhoto`. No `alt`
 * field: the shelter's own `displayName` is the accessible name, computed
 * at render time rather than stored a second time here (PR 3b's upload
 * will be the thing that actually crops it square - not built yet).
 */
export const ShelterLogoSchema = z.object({
  storageKey: z.string().min(1),
  width: z.int().positive(),
  height: z.int().positive(),
});
export type ShelterLogo = z.infer<typeof ShelterLogoSchema>;
