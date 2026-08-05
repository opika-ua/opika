import type { Database } from "@opika/db";
import type { AdopterId } from "@opika/domain";

/**
 * Request context carried through every oRPC handler.
 *
 * `adopterId` is null for unauthenticated requests (cities.list, feed.list
 * without seen-set). Handlers that require a session check for non-null and
 * return UNAUTHENTICATED otherwise.
 */
export type AppContext = {
  db: Database;
  adopterId: AdopterId | null;
  tokenHash: string | null;
  now: Date;
  /**
   * Set-Cookie headers to send back. Accumulated during the request and
   * written by the route handler after the oRPC handler returns.
   */
  setCookies: string[];
};
