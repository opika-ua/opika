import { AdopterProfileSchema, FeedFiltersSchema } from "@opika/domain";
import { z } from "zod";

/**
 * The adopter's own record, minus the internals of how they are identified.
 * Whether the session is anonymous or account-backed is a server concern; the
 * client needs to know only that it has one.
 */
export const AdopterViewSchema = AdopterProfileSchema.pick({
  id: true,
  country: true,
  preferredLocale: true,
}).extend({
  isAnonymous: z.boolean(),
});
export type AdopterView = z.infer<typeof AdopterViewSchema>;

export const SessionBootstrapViewSchema = z.object({
  adopter: AdopterViewSchema,
  filters: FeedFiltersSchema,
  /**
   * Every pure function in the domain takes `now` as an argument, and a
   * device's own clock is not a safe source for it. Sending the server's time
   * means a wrong local clock cannot make a stale listing look fresh.
   */
  serverTime: z.date(),
});
export type SessionBootstrapView = z.infer<typeof SessionBootstrapViewSchema>;
