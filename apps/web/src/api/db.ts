import { createDatabase } from "@opika/db";
import { requireEnv } from "./env";

let cachedDb: ReturnType<typeof createDatabase> | undefined;

/**
 * The connection is opened on first call rather than at module scope
 * because `next build` imports route modules to collect page data — a build
 * must not require a runtime secret to be present.
 *
 * Memoised so a warm server instance reuses one `Database` object across
 * requests and across the two call sites (the HTTP route, and the
 * in-process router client used by Server Components) rather than
 * re-parsing `DATABASE_URL` and re-instantiating a driver every time.
 * **Not** "a pool" as of O-9 (`packages/db/src/client.ts`, 2026-09-06
 * reprioritisation "2.1"): in production, `createDatabase` returns a
 * `neon-http` instance, which holds no connection or pool at all — each
 * query is its own stateless HTTP request. The memoisation still earns
 * its place (skips redundant `new URL`/driver setup on every request),
 * it just isn't reusing a socket the way this comment used to imply.
 */
export function getDb(): ReturnType<typeof createDatabase> {
  cachedDb ??= createDatabase(requireEnv("DATABASE_URL"));
  return cachedDb;
}
