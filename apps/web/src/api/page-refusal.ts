import { ORPCError } from "@orpc/server";

/**
 * How a public page reads a refused procedure call (the animal page and the
 * shelter page): `NOT_FOUND` is an answer about the thing (it isn't there to
 * show), `RATE_LIMITED` is a refusal to answer at all (RL-F1), and anything
 * else is not a refusal, so the caller rethrows it to the route's error
 * boundary rather than calling a database failure "not found".
 */
export function pageRefusalOf(error: unknown): "not_found" | "rate_limited" | null {
  if (!(error instanceof ORPCError)) return null;
  if (error.code === "NOT_FOUND") return "not_found";
  if (error.code === "RATE_LIMITED") return "rate_limited";
  return null;
}
