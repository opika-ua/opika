import { ORPCError } from "@orpc/server";
import type { AppCaller } from "./context";
import { type RateLimiter, sharedRateLimiter } from "./rate-limit";

/**
 * Audit F1: an anonymous adopter costs one request, so the per-adopter reveal
 * budget (30 shelters / 24 h, `reveal-rate-limit.ts`) bounded nothing for a
 * caller that throws its cookie away. These two budgets sit per IP (per /64
 * for IPv6, `rateLimitSubjectOf`), on top of it. Numbers approved by the owner.
 */
export const ADOPTER_MINTS_PER_IP_PER_DAY = 10;
export const NEW_SHELTER_REVEALS_PER_IP_PER_DAY = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PerIpBudgets = {
  /** `session.bootstrap` creating an adopter (returning an existing one is free). */
  adopterMints: RateLimiter;
  /**
   * `animals.reveal` of a shelter new to that adopter: the unit the per-adopter
   * budget counts, so a free re-reveal stays free here too, for every adopter
   * behind one address.
   */
  newShelterReveals: RateLimiter;
};

export type PerIpBudgetSizes = { adopterMints: number; newShelterReveals: number };

const SERVED_SIZES: PerIpBudgetSizes = {
  adopterMints: ADOPTER_MINTS_PER_IP_PER_DAY,
  newShelterReveals: NEW_SHELTER_REVEALS_PER_IP_PER_DAY,
};

/**
 * The Playwright harness mints an adopter per test from one address
 * (127.0.0.1), far past ten a day, so its `next start` sets
 * `HARNESS_LIFTS_PER_IP_BUDGETS=1`. Ignored on any Vercel deployment.
 */
const LIFTED_SIZE = 1_000_000;

export function perIpBudgetSizesFor(
  env: Readonly<Record<string, string | undefined>>,
): PerIpBudgetSizes {
  const onVercel = Boolean(env.VERCEL) || Boolean(env.VERCEL_ENV);
  if (!onVercel && env.HARNESS_LIFTS_PER_IP_BUDGETS === "1") {
    return { adopterMints: LIFTED_SIZE, newShelterReveals: LIFTED_SIZE };
  }
  return SERVED_SIZES;
}

type LimiterFactory = (opts: {
  name: string;
  windowMs: number;
  maxRequests: number;
}) => RateLimiter;

export function perIpBudgetsOf(make: LimiterFactory, sizes: PerIpBudgetSizes): PerIpBudgets {
  return {
    adopterMints: make({ name: "adopter-mint", windowMs: DAY_MS, maxRequests: sizes.adopterMints }),
    newShelterReveals: make({
      name: "reveal-ip",
      windowMs: DAY_MS,
      maxRequests: sizes.newShelterReveals,
    }),
  };
}

/** The served budgets: Upstash where configured, in-memory otherwise (`sharedRateLimiter`). */
let served: PerIpBudgets | undefined;
export function servedPerIpBudgets(): PerIpBudgets {
  served ??= perIpBudgetsOf(sharedRateLimiter, perIpBudgetSizesFor(process.env));
  return served;
}

/**
 * Spends one unit of `budget` for this caller's address; false when it is spent.
 * An in-process caller (a Server Component) has no address and is refused:
 * neither procedure that spends these is on that path (`router-client.ts`).
 */
export async function spendPerIpBudget(
  caller: AppCaller,
  budget: keyof PerIpBudgets,
  now: Date,
): Promise<boolean> {
  if (caller.kind !== "http") return false;
  return caller.budgets[budget].check(caller.ipKey, now);
}

/**
 * A spent per-IP budget answers like the per-IP API limiter: a 429 the client
 * reads as `TOO_MANY_REQUESTS` («Забагато запитів»). Never the defined
 * `RATE_LIMITED`, whose reveal copy says "you opened many shelters", which is
 * false for someone else behind the same address.
 */
export const perIpBudgetSpent = (): ORPCError<"TOO_MANY_REQUESTS", unknown> =>
  new ORPCError("TOO_MANY_REQUESTS");
