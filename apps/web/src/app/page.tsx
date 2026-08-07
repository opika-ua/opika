import { anonymousRouterClient } from "../api/server-client";
import { HomeScreen } from "../features/home/HomeScreen";

/**
 * Forces per-request rendering rather than `next build`-time static
 * generation. Without this, the build tries to prerender this page by
 * calling the DB-backed fetch below at build time, which needs
 * DATABASE_URL to be present as a build-time secret — exactly what
 * requireEnv's own comment says a build must never require. Cities can
 * change too (an admin adding one, per Phase H2), so a static snapshot
 * baked in at build time would go stale silently.
 */
export const dynamic = "force-dynamic";

/**
 * Server Component: fetches cities in-process (anonymousRouterClient, no
 * HTTP hop, same implement(contract) output-stripping the HTTP route gets —
 * docs/gallery-contract-decisions.md §5) so Screen 01's city chips carry
 * real CityIds from the first paint.
 */
export default async function Home() {
  const cities = await anonymousRouterClient().cities.list({});
  return <HomeScreen cities={cities} />;
}
