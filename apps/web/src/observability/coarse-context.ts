import { coarseFromUserAgent, coarseFromUserAgentData, type UserAgentDataLike } from "./coarse-ua";

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The header value, whichever way the SDK cased the name. */
function userAgentHeader(headers: unknown): unknown {
  if (!isObject(headers)) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === "user-agent") return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

/** Where the SDK left the request's UA before our scrubber drops all headers: the event, or the processing metadata. */
function userAgentOf(event: Loose): unknown {
  const request = isObject(event.request) ? event.request : {};
  const meta = isObject(event.sdkProcessingMetadata) ? event.sdkProcessingMetadata : {};
  const normalized = isObject(meta.normalizedRequest) ? meta.normalizedRequest : {};
  return userAgentHeader(request.headers) ?? userAgentHeader(normalized.headers);
}

/** `navigator.userAgentData` where the browser has it; the server and older browsers have none. */
function browserUserAgentData(): UserAgentDataLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  const data = (navigator as { userAgentData?: unknown }).userAgentData;
  return isObject(data) ? (data as UserAgentDataLike) : undefined;
}

/**
 * Runs as an event processor, before `beforeSend` and before the scrubber drops every header, so the
 * UA is still readable. Listed last so the browser's own UA header (httpContext) is already there.
 */
export const coarseUserAgentIntegration = () => ({
  name: "CoarseUserAgent",
  // A client processor, not `processEvent`: the request data is on the event only by the time these run.
  setup: (client: { addEventProcessor: (fn: <T extends object>(event: T) => T) => void }) =>
    client.addEventProcessor(coarseContextsOf),
});

/**
 * Sets `contexts.browser` and `contexts.os` from the request's UA (server) or the page's (browser),
 * replacing any the SDK put there. The header itself is dropped by `scrubEvent` right after.
 * An event with no UA source at all gets none.
 */
/** The page's own UA, in a browser only: on the server `navigator.userAgent` is the runtime's, not a visitor's. */
const pageUserAgent = (): unknown =>
  typeof window === "undefined" ? undefined : navigator.userAgent;

export function coarseContextsOf<T extends object>(event: T): T {
  const source = event as Loose;
  const userAgent = userAgentOf(source) ?? pageUserAgent();
  const data = browserUserAgentData();
  if (userAgent === undefined && data === undefined) return event;
  const coarse =
    data === undefined ? coarseFromUserAgent(userAgent) : coarseFromUserAgentData(data, userAgent);
  const contexts = isObject(source.contexts) ? source.contexts : {};
  return { ...source, contexts: { ...contexts, ...coarse } } as T;
}
