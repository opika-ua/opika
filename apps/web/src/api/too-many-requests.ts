import { ORPCError } from "@orpc/client";

/**
 * The per-IP limiter's refusal (`api/public-rpc-route.ts`): a plain
 * `new Response("Too Many Requests", { status: 429 })` returned before oRPC's
 * handler runs, which the oRPC client reports as `TOO_MANY_REQUESTS` and not as
 * a *defined* contract error. A spent per-IP budget (`perIpBudgetSpent`, audit
 * F1) answers with the same undefined code from inside the handler. It is not the reveal budget's `RATE_LIMITED` (30
 * distinct shelters in a rolling day, a defined error with its own copy): a
 * caller that tells the two apart checks that one first.
 *
 * Browser-side callers use it to say "too many requests" instead of blaming the
 * site (audit 2026-10-22, G1); `isDefinedError` is false for it, and so is
 * `instanceof TypeError`, which is why it needs a check of its own.
 */
export function isTooManyRequests(error: unknown): boolean {
  return error instanceof ORPCError && error.code === "TOO_MANY_REQUESTS";
}
