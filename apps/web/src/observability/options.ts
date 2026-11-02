import type { BrowserOptions } from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

/** The tunnel the browser SDK posts to (`app/api/monitoring/route.ts`). */
export const TUNNEL_PATH = "/api/monitoring";

/**
 * Every key of the SDK's `DataCollection`, set to nothing. Spelled out in full, not left to
 * defaults: v11 defaults to collecting cookies, headers, bodies, query strings, user info and
 * local variables, so a key missing here would be on. `options.test.ts` fails when the installed
 * SDK has a key this object lacks, and `satisfies Required<...>` fails the type check.
 * Source lines (`frameContextLines`) are off too: the function, file and line are enough.
 */
export const MINIMAL_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: false, response: false },
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
} satisfies Required<NonNullable<BrowserOptions["dataCollection"]>>;

export type SentryTestKnobs = {
  /** Tests only: the SDK's own collection with this module's scrubber left out, to prove the first layer alone. */
  unscrubbed?: boolean;
};

/**
 * Options common to the browser, Node and edge SDKs: errors only, tracing off (no tracing key
 * is set, so nothing starts a span that is sent), nothing collected beyond the event itself, no breadcrumbs.
 */
export function baseSentryOptions(dsn: string, knobs: SentryTestKnobs = {}) {
  return {
    dsn,
    // Tracing is off by leaving every tracing key out. `tracesSampleRate: 0` is not off in v11: a
    // sampled incoming `sentry-trace` still wins and streamed spans leave. `[]` stops the SDK adding
    // `sentry-trace` and `baggage` (public key, org, transaction name) to outgoing requests.
    tracePropagationTargets: [] as string[],
    sendDefaultPii: false,
    dataCollection: MINIMAL_DATA_COLLECTION,
    maxBreadcrumbs: 0,
    sendClientReports: false,
    attachStacktrace: true,
    debug: false,
    ...(knobs.unscrubbed === true
      ? {}
      : {
          beforeSend: (event: object) => scrubEvent(event) as never,
          beforeBreadcrumb: (crumb: object) => scrubBreadcrumb(crumb) as never,
        }),
  } as const;
}
