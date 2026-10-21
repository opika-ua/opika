import type { Database } from "@opika/db";
import { getDb } from "./db";
import { routerClientOver } from "./router-client";

/**
 * The public pages' in-process router client (`router-client.ts` has the why
 * of the picked subset and the per-call context), over the memoised production
 * connection by default.
 *
 * `db` is a parameter, defaulting to the memoised production connection, so a
 * test can inject the ephemeral database `createTestHarness` sets up instead
 * of either sharing `getDb`'s process-wide singleton or duplicating the
 * client's context-building just to exercise it. A kabinet module imports
 * `routerClientOver` instead, so it never reaches `getDb` (F8-F1,
 * `kabinet-db-scan.test.ts`).
 */
export function anonymousRouterClient(db: Database = getDb()) {
  return routerClientOver(db);
}
