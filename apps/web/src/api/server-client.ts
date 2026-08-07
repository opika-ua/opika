import type { Database } from "@opika/db";
import { createRouterClient } from "@orpc/server";
import type { AppContext } from "./context";
import { getDb } from "./db";
import { router } from "./router";

/**
 * In-process router client for Server Components — no HTTP hop, but every
 * procedure still runs through `implement(contract)`'s output-schema
 * validation and stripping, because it's the same `router` the HTTP route
 * serves. See docs/gallery-contract-decisions.md §5 for the full argument;
 * this is that mechanism's first real use, ahead of the gallery it was
 * decided for.
 *
 * Anonymous only: no adopterId or tokenHash, since nothing calling this way
 * carries a session — there's no cookie to read (Server Components can't
 * write one anyway) and no per-request identity to attach. A caller that
 * needs a real adopter session belongs on the HTTP path, not this one.
 *
 * `db` is a parameter, defaulting to the memoised production connection,
 * so a test can inject the ephemeral database `createTestHarness` sets up
 * instead of either sharing `getDb`'s process-wide singleton or duplicating
 * this function's context-building just to exercise it.
 */
export function anonymousRouterClient(db: Database = getDb()) {
  const context: AppContext = {
    db,
    adopterId: null,
    tokenHash: null,
    now: new Date(),
    setCookies: [],
  };
  return createRouterClient(router, { context });
}
