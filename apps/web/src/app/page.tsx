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
 * Fetches cities in-process (anonymousRouterClient, no HTTP hop, same
 * implement(contract) output-stripping the HTTP route gets —
 * docs/gallery-contract-decisions.md §5) so Screen 01's city chips carry
 * real CityIds from the first paint.
 *
 * A separate function from the default export, purely so page.test.tsx can
 * call it with a test database injected — `client` defaults to the real
 * production client, so `Home()` below still calls this with zero arguments,
 * exactly as it did before this split. Giving `Home` itself an optional
 * parameter was considered and rejected: Next.js calls page components with
 * its own `{ params, searchParams }` object, which would silently override a
 * default value rather than leave it unset, breaking the real page to make
 * the test convenient.
 */
export async function renderHome(
  client: ReturnType<typeof anonymousRouterClient> = anonymousRouterClient(),
) {
  const cities = await client.cities.list({});
  return <HomeScreen cities={cities} />;
}

/** Server Component. Next.js calls this with no usable arguments. */
export default async function Home() {
  return renderHome();
}
