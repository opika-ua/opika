import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions, type SentryTestKnobs, TUNNEL_PATH } from "./options";

/**
 * The browser SDK, loaded by `load-client.ts` after idle and only when a DSN exists. Its integration
 * list is explicit (no default list): no tracing, no replay, no feedback, no breadcrumb sources, no
 * session tracking. Events go through our own tunnel, never straight to Sentry.
 */
export function initClientSentry(
  dsn: string,
  test: SentryTestKnobs & { transport?: Sentry.BrowserOptions["transport"] } = {},
) {
  return Sentry.init({
    ...baseSentryOptions(dsn, test),
    tunnel: TUNNEL_PATH,
    defaultIntegrations: false,
    integrations: [
      Sentry.globalHandlersIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.httpContextIntegration(),
    ],
    ...(test.transport === undefined ? {} : { transport: test.transport }),
  });
}

/** Starts the SDK if the idle load hasn't yet (an error boundary can fire first), then captures. */
export function captureClientError(error: unknown, dsn: string): void {
  if (Sentry.getClient() === undefined) initClientSentry(dsn);
  Sentry.captureException(error);
}
