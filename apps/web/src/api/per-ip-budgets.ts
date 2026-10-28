import { ORPCError } from "@orpc/server";
import type { AppCaller } from "./context";
import { type RateLimiter, sharedRateLimiter } from "./rate-limit";
import { redisCredentialsOf } from "./redis-credentials";

/**
 * Audit F1: an anonymous adopter costs one request, so the per-adopter reveal
 * budget (30 shelters / 24 h, fixed, `reveal-rate-limit.ts`) bounded nothing for a
 * caller that throws its cookie away. These two budgets sit per IP (per /64 for
 * IPv6, `rateLimitSubjectOf`), on top of it. Sizes are environment variables
 * (owner, 2026-10-28), documented in `docs/launch-sequence.md`.
 */
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

/** Each size's variable and default, per 24 h per address. */
export const PER_IP_BUDGET_VARIABLES = {
  adopterMints: { variable: "RATE_LIMIT_ADOPTERS_PER_IP_DAY", fallback: 50 },
  newShelterReveals: { variable: "RATE_LIMIT_REVEALS_PER_IP_DAY", fallback: 100 },
} as const;

export type BudgetConfigWarning = {
  event: "rate_limit_config_invalid";
  variable: string;
  using: number;
};

const consoleConfigWarning = (line: BudgetConfigWarning) => console.warn(line);

/**
 * A positive whole number, or the default with a warning naming the variable
 * and the default only: a mistyped value could be a secret pasted into the
 * wrong field, so it is never logged. Unset is the default, silently.
 */
function sizeFrom(
  env: Readonly<Record<string, string | undefined>>,
  { variable, fallback }: { variable: string; fallback: number },
  warn: (line: BudgetConfigWarning) => void,
): number {
  const raw = env[variable];
  if (raw === undefined) return fallback;
  const text = raw.trim();
  const size = /^[1-9][0-9]*$/.test(text) ? Number(text) : Number.NaN;
  if (Number.isSafeInteger(size)) return size;
  warn({ event: "rate_limit_config_invalid", variable, using: fallback });
  return fallback;
}

/**
 * The Playwright harness mints an adopter per test from one address
 * (127.0.0.1), so its `next start` sets `HARNESS_LIFTS_PER_IP_BUDGETS=1`.
 * Ignored on any Vercel deployment and wherever the shared store is configured.
 */
const LIFTED_SIZE = 1_000_000;

export function perIpBudgetSizesFor(
  env: Readonly<Record<string, string | undefined>>,
  warn: (line: BudgetConfigWarning) => void = consoleConfigWarning,
): PerIpBudgetSizes {
  const onVercel = Boolean(env.VERCEL) || Boolean(env.VERCEL_ENV);
  const sharedStore = redisCredentialsOf(env) !== null;
  if (!onVercel && !sharedStore && env.HARNESS_LIFTS_PER_IP_BUDGETS === "1") {
    return { adopterMints: LIFTED_SIZE, newShelterReveals: LIFTED_SIZE };
  }
  return {
    adopterMints: sizeFrom(env, PER_IP_BUDGET_VARIABLES.adopterMints, warn),
    newShelterReveals: sizeFrom(env, PER_IP_BUDGET_VARIABLES.newShelterReveals, warn),
  };
}

/** Read and validated once per instance; `instrumentation.ts` calls it at startup. */
let servedSizes: PerIpBudgetSizes | undefined;
export function servedPerIpBudgetSizes(): PerIpBudgetSizes {
  servedSizes ??= perIpBudgetSizesFor(process.env);
  return servedSizes;
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
  served ??= perIpBudgetsOf(sharedRateLimiter, servedPerIpBudgetSizes());
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
