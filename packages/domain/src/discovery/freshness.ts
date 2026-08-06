import { z } from "zod";
import { INTL_LOCALE, type Locale } from "../primitives/locale";

export const FreshnessKindSchema = z.enum(["fresh", "aging", "stale"]);
export type FreshnessKind = z.infer<typeof FreshnessKindSchema>;

/**
 * `ageDays` is carried even though it is derivable from `updatedAt`, because
 * the point of modelling freshness as a value is that no display surface ever
 * touches the clock. If a badge had to recompute the delta it would need `now`,
 * and `Date.now()` would appear in a component within a week.
 */
export const FreshnessSchema = z.object({
  kind: FreshnessKindSchema,
  updatedAt: z.date(),
  ageDays: z.int().nonnegative(),
});
export type Freshness = z.infer<typeof FreshnessSchema>;

export const FreshnessPolicySchema = z
  .object({
    freshMaxDays: z.int().positive(),
    agingMaxDays: z.int().positive(),
  })
  /**
   * An inverted policy silently removes a band rather than failing: with
   * {fresh: 30, aging: 7} nothing is ever `aging` and a month-old listing reads
   * as fresh, which is the exact dishonesty the badge exists to prevent.
   */
  .refine((policy) => policy.agingMaxDays >= policy.freshMaxDays, {
    error: "agingMaxDays must be greater than or equal to freshMaxDays",
    path: ["agingMaxDays"],
  });
export type FreshnessPolicy = z.infer<typeof FreshnessPolicySchema>;

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  freshMaxDays: 7,
  agingMaxDays: 30,
};

const MS_PER_DAY = 86_400_000;

/**
 * `policy` is required rather than defaulted. A default parameter is how a
 * tuning knob quietly stops being threaded through, and these thresholds are
 * meant to be tuned against real shelter cadence.
 *
 * `ageDays` counts elapsed whole 24-hour periods, not calendar days: calendar
 * arithmetic needs a time zone, and this package has no business holding one.
 * The visible consequence is that something updated 20 hours ago reads as today
 * rather than as yesterday.
 *
 * A negative delta is clamped to zero. A device with a fast clock should not be
 * able to make a listing look fresher than it is.
 */
export const freshnessOf = (lastUpdatedAt: Date, now: Date, policy: FreshnessPolicy): Freshness => {
  const elapsedMs = Math.max(0, now.getTime() - lastUpdatedAt.getTime());
  const ageDays = Math.floor(elapsedMs / MS_PER_DAY);

  const kind: FreshnessKind =
    ageDays <= policy.freshMaxDays ? "fresh" : ageDays <= policy.agingMaxDays ? "aging" : "stale";

  return { kind, updatedAt: lastUpdatedAt, ageDays };
};

/**
 * The sign-and-unit contract for relative time, in one place.
 *
 * `Intl.RelativeTimeFormat` produces correct Ukrainian plurals for free, but
 * only when called with a negative offset and the "day" unit — which is the
 * mistake worth a test, rather than whether the platform's plural rules work.
 * Keeping the call here means every surface cannot re-derive the sign wrongly.
 *
 * Locale is a parameter, so nothing about a language or a product is baked in.
 */
export const formatFreshnessRelative = (freshness: Freshness, locale: Locale): string =>
  new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: "auto" }).format(
    -freshness.ageDays,
    "day",
  );

/**
 * Fails loudly at boot on a runtime built without full ICU, where every locale
 * silently collapses to English. A freshness badge reading "5 days ago" to a
 * Ukrainian adopter is the kind of defect that ships unnoticed.
 */
const ukrainianMonthName = (): string =>
  new Intl.DateTimeFormat("uk-UA", { month: "long" }).format(new Date(Date.UTC(2026, 0, 5)));

/**
 * Fails loudly at boot on a runtime built without full ICU, where every locale
 * silently collapses to English. A freshness badge reading "5 days ago" to a
 * Ukrainian adopter is the kind of defect that ships unnoticed.
 *
 * The lookup is a parameter so the failure path can be exercised without
 * stubbing a global constructor — a boot assertion whose throw branch is never
 * tested is decoration.
 */
export const assertFullIcu = (resolveMonthName: () => string = ukrainianMonthName): void => {
  const month = resolveMonthName();
  if (month !== "січень") {
    throw new Error(
      `Runtime lacks full ICU data: expected "січень" for uk-UA, received "${month}".`,
    );
  }
};
