import { createDatabase } from "@opika/db";
import { requireEnv } from "./env";

let cachedDb: ReturnType<typeof createDatabase> | undefined;

/**
 * The connection is opened on first call rather than at module scope
 * because `next build` imports route modules to collect page data — a build
 * must not require a runtime secret to be present. Memoised so a server
 * instance still reuses a single pool across requests, and across the two
 * call sites (the HTTP route, and the in-process router client used by
 * Server Components).
 */
export function getDb(): ReturnType<typeof createDatabase> {
  cachedDb ??= createDatabase(requireEnv("DATABASE_URL"));
  return cachedDb;
}
