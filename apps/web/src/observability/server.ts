import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions, type SentryTestKnobs } from "./options";

/**
 * Node runtime (the edge one is `edge.ts`). Local variables, console capture and request bodies
 * stay off; the integrations that exist only to add data are filtered out of the defaults.
 */
const DROPPED_INTEGRATIONS = new Set([
  "LocalVariables",
  "LocalVariablesAsync",
  "Console",
  "OnUncaughtException",
  // Release-health sessions are their own envelope type and carry the scope user's id.
  "ProcessSession",
]);

export function initServerSentry(
  dsn: string,
  test: SentryTestKnobs & { transport?: Sentry.NodeOptions["transport"] } = {},
) {
  return Sentry.init({
    ...baseSentryOptions(dsn, test),
    includeLocalVariables: false,
    // Errors thrown in a request reach `onRequestError`; a process-wide handler adds nothing.
    integrations: (defaults) => [
      ...defaults.filter((i) => !DROPPED_INTEGRATIONS.has(i.name) && i.name !== "Http"),
      // Request sessions would send release-health envelopes; only error events leave.
      Sentry.httpIntegration({ sessions: false }),
    ],
    ...(test.transport === undefined ? {} : { transport: test.transport }),
  });
}
