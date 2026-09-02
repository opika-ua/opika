/**
 * Next.js runs `register()` once per server instance, before it accepts its
 * first request — the one place in this app where an eager, boot-time check
 * is possible without also making `next build` require a runtime secret.
 * `register()` does not run during `next build`; only when a dev server or a
 * deployed instance (a Vercel cold start included) actually starts serving.
 *
 * Guarded to the Node.js runtime per Next's own documented pattern for this
 * file — this app doesn't run anything on Edge today (`proxy.ts`'s own
 * comment: Next.js 16 defaults `proxy.ts` to Node, not Edge, unlike the old
 * `middleware.ts` convention), but the guard costs nothing and keeps this
 * file correct if that ever changes.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./api/env");
    validateEnv();
  }
}
