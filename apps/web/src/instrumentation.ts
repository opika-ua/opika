import type { Instrumentation } from "next";

/**
 * Next.js runs `register()` once per server instance, before it accepts its
 * first request - the one place in this app where an eager, boot-time check
 * is possible without also making `next build` require a runtime secret.
 * `register()` does not run during `next build`; only when a dev server or a
 * deployed instance (a Vercel cold start included) actually starts serving.
 *
 * Guarded to the Node.js runtime per Next's own documented pattern for this
 * file - this app doesn't run anything on Edge today (`proxy.ts`'s own
 * comment: Next.js 16 defaults `proxy.ts` to Node, not Edge, unlike the old
 * `middleware.ts` convention), but the guard costs nothing and keeps this
 * file correct if that ever changes.
 */
export async function register(): Promise<void> {
  await startServerMonitoring();
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./api/env");
    validateEnv();
    // The per-IP budgets' sizes, validated once at startup (a bad value warns, never throws).
    const { servedPerIpBudgetSizes } = await import("./api/per-ip-budgets");
    servedPerIpBudgetSizes();
    const { assertDemoDiscoverabilityInvariant } = await import("./seo-flags");
    assertDemoDiscoverabilityInvariant();
  }
}

/**
 * H5: Sentry on the server and the edge, only when `NEXT_PUBLIC_SENTRY_DSN` is set; without it the
 * SDK module is never loaded. Dynamic imports keep it out of every code path that doesn't need it.
 */
async function startServerMonitoring(): Promise<void> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  // Each branch is resolved by Next per runtime, so neither bundle holds the other's SDK entry.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initServerSentry } = await import("./observability/server");
    initServerSentry(dsn);
  } else if (process.env.NEXT_RUNTIME === "edge") {
    const { initEdgeSentry } = await import("./observability/edge");
    initEdgeSentry(dsn);
  }
}

/** Next's hook for errors thrown while serving a request; the same switch as above. */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN?.trim()) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(...args);
};
