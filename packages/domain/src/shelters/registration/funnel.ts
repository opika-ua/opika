import { z } from "zod";

/**
 * The operator's onboarding funnel (§8, §11.7), in order. Server-side only, no IP, no user agent,
 * and never shown to a shelter. «registration_started» is left to page analytics.
 */
export const FUNNEL_EVENT_KINDS = [
  "registered",
  "email_confirmed",
  "first_draft",
  "approved",
  "first_published",
] as const;
export const FunnelEventKindSchema = z.enum(FUNNEL_EVENT_KINDS);
export type FunnelEventKind = z.infer<typeof FunnelEventKindSchema>;

/** The operator's mini-table looks back this far. */
export const FUNNEL_WINDOW_DAYS = 30;
