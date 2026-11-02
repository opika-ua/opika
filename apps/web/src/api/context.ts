import type { Database } from "@opika/db";
import type { AdopterId } from "@opika/domain";
import type { PerIpBudgets } from "./per-ip-budgets";

/**
 * Who is calling, for the per-IP budgets (audit F1). `http`: the `/api/rpc`
 * route, with the caller's HMAC'd address key (`ipRateLimitKey`). `in_process`:
 * a Server Component through `router-client.ts`, which has no address.
 */
export type AppCaller =
  | { kind: "http"; ipKey: string; budgets: PerIpBudgets }
  | { kind: "in_process" };

/**
 * Request context carried through every oRPC handler.
 *
 * `adopterId` is null for unauthenticated requests (cities.byIds, feed.list
 * without seen-set). Handlers that require a session check for non-null and
 * return UNAUTHENTICATED otherwise.
 */
export type AppContext = {
  db: Database;
  adopterId: AdopterId | null;
  tokenHash: string | null;
  now: Date;
  caller: AppCaller;
  /**
   * Set-Cookie headers to send back. Accumulated during the request and
   * written by the route handler after the oRPC handler returns.
   */
  setCookies: string[];
  /**
   * Present only when the request carries a kabinet session cookie; true for a valid, live
   * shelter session (`animals.reveal` neither records nor budgets those). Absent: a visitor.
   */
  isKabinetSession?: (() => Promise<boolean>) | undefined;
};
