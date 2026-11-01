import { z } from "zod";

export const RegionIdSchema = z.uuid().brand<"RegionId">();
export type RegionId = z.infer<typeof RegionIdSchema>;

export const RegionKindSchema = z.enum(["oblast", "autonomous_republic", "special_status_city"]);
export type RegionKind = z.infer<typeof RegionKindSchema>;

export const RegionSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .brand<"RegionSlug">();
export type RegionSlug = z.infer<typeof RegionSlugSchema>;

/** KATOTTG first-level code, `UA` and two digits. */
export const RegionCodeSchema = z
  .string()
  .regex(/^UA\d{2}$/)
  .brand<"RegionCode">();
export type RegionCode = z.infer<typeof RegionCodeSchema>;

/**
 * The 27 first-level units of Ukraine: 24 oblasts, the Autonomous Republic of Crimea, Kyiv and
 * Sevastopol. A fixed list kept as a constant (`packages/db/src/geography/regions-data.ts`), not
 * user data.
 */
export const RegionSchema = z.object({
  id: RegionIdSchema,
  code: RegionCodeSchema,
  kind: RegionKindSchema,
  slug: RegionSlugSchema,
  name: z.object({
    /** Official full form. */
    uk: z.string().min(1),
    /** Short form for a card line. */
    ukShort: z.string().min(1),
    /** Bare label for a filter pill. */
    ukLabel: z.string().min(1),
    en: z.string().min(1),
  }),
});
export type Region = z.infer<typeof RegionSchema>;
