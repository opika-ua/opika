import * as Sentry from "@sentry/nextjs";
import { coarseUserAgentIntegration } from "./coarse-context";
import { baseSentryOptions, type SentryTestKnobs } from "./options";

/** The edge runtime: no Node integrations exist there, so the shared options are all it needs. */
export function initEdgeSentry(dsn: string, test: SentryTestKnobs = {}) {
  return Sentry.init({
    ...baseSentryOptions(dsn, test),
    integrations: [coarseUserAgentIntegration()],
  });
}
