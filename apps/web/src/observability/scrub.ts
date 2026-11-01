/**
 * The privacy layer under every Sentry event, from the browser, the server and the tunnel.
 * Pure and SDK-free, so the tunnel can run it without loading the SDK. The SDK's own collection is
 * already set to nothing (`options.ts`); this is the second layer for what still slips into a string.
 * The approved /pro sentence (`about.data`) depends on what is kept here: error type, place in code,
 * page address without parameters, browser and system - nothing else.
 */

export const FILTERED = "[Filtered]";
export const MAX_STRING_LENGTH = 1000;
const MAX_DEPTH = 8;

const EMAIL = /[\p{L}\p{N}._%+'-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
// UA numbers: optional 38 / +38 prefix, a 0, then nine digits in any grouping (0501234567,
// +380 (50) 123-45-67, 380501234567). Never part of a longer digit run.
const PHONE = /(?<![\p{N}])\(?(?:\+?38[\s().-]*)?0(?:[\s().-]*\d){9}(?![\p{N}])/gu;
const BEARER = /\b(?:Bearer|Basic)\s+[\w.~+/=-]+/gi;
const GATE_PARAM = /\bgate=[^&\s"'#]*/gi;
const HEADER_LINE = /\b(?:cookie|set-cookie|authorization)\s*[:=]\s*[^\n]*/gi;
// A query string after a URL or an absolute path inside free text.
const QUERY_IN_TEXT = /(\bhttps?:\/\/[^\s?#"'<>]*|(?<=^|[\s"'(])\/[\w\-./%[\]]+)\?[^\s"'<>)]*/g;
const SENSITIVE_KEY =
  /cookie|authorization|password|passwd|secret|token|email|e-mail|phone|telephone|contacts?|shelterSnapshot|^gate$|^body$|^data$|query_string/i;

/** Drops the query string and the fragment; keeps origin and path. */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

export function scrubString(value: string): string {
  const cleaned = value
    .replace(HEADER_LINE, FILTERED)
    .replace(BEARER, FILTERED)
    .replace(QUERY_IN_TEXT, "$1")
    .replace(GATE_PARAM, FILTERED)
    .replace(EMAIL, FILTERED)
    .replace(PHONE, FILTERED);
  return cleaned.length > MAX_STRING_LENGTH
    ? `${cleaned.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : cleaned;
}

/** Strings scrubbed, objects walked, values under a sensitive key replaced. */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return FILTERED;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? FILTERED : scrubValue(inner, depth + 1);
  }
  return out;
}

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const urlOf = (value: unknown): unknown =>
  typeof value === "string" ? scrubString(scrubUrl(value)) : value;

function scrubFrame(frame: unknown): unknown {
  if (!isObject(frame)) return frame;
  const {
    vars: _vars,
    pre_context: _pre,
    post_context: _post,
    context_line: _line,
    ...rest
  } = frame;
  for (const key of ["filename", "abs_path"]) if (key in rest) rest[key] = urlOf(rest[key]);
  if (typeof rest.module === "string") rest.module = scrubString(rest.module);
  return rest;
}

function scrubException(exception: unknown): unknown {
  if (!isObject(exception) || !Array.isArray(exception.values)) return exception;
  return {
    ...exception,
    values: exception.values.map((entry) => {
      if (!isObject(entry)) return entry;
      const out: Loose = { ...entry };
      if (typeof out.value === "string") out.value = scrubString(out.value);
      if (typeof out.type === "string") out.type = scrubString(out.type);
      if (isObject(out.stacktrace) && Array.isArray(out.stacktrace.frames)) {
        out.stacktrace = { ...out.stacktrace, frames: out.stacktrace.frames.map(scrubFrame) };
      }
      // A mechanism's free-form `data` could carry anything; its type and handled flag stay.
      if (isObject(out.mechanism)) {
        const { data: _data, ...mechanism } = out.mechanism;
        out.mechanism = mechanism;
      }
      return out;
    }),
  };
}

/** Only the page address, the method and the browser's own UA string stay of a request. */
function scrubRequest(request: unknown): Loose | undefined {
  if (!isObject(request)) return undefined;
  const out: Loose = {};
  if (typeof request.url === "string") out.url = scrubString(scrubUrl(request.url));
  if (typeof request.method === "string") out.method = request.method;
  if (isObject(request.headers)) {
    const ua = Object.entries(request.headers).find(([k]) => k.toLowerCase() === "user-agent");
    if (ua !== undefined && typeof ua[1] === "string") {
      out.headers = { "User-Agent": scrubString(ua[1]) };
    }
  }
  return out;
}

/**
 * Applies to any event type (error, transaction, anything else): removes user, breadcrumbs,
 * cookies, every header but the UA, the request body and query, local variables and source
 * lines; scrubs every string that remains.
 */
export function scrubEvent<T extends object>(event: T): T {
  const {
    user: _user,
    breadcrumbs: _breadcrumbs,
    server_name: _serverName,
    request,
    exception,
    extra,
    contexts,
    tags,
    message,
    logentry,
    transaction,
    spans,
    ...rest
  } = event as Loose;
  const out: Loose = { ...rest };
  const scrubbedRequest = scrubRequest(request);
  if (scrubbedRequest !== undefined) out.request = scrubbedRequest;
  if (exception !== undefined) out.exception = scrubException(exception);
  if (extra !== undefined) out.extra = scrubValue(extra);
  if (contexts !== undefined) out.contexts = scrubValue(contexts);
  if (tags !== undefined) out.tags = scrubValue(tags);
  if (typeof message === "string") out.message = scrubString(message);
  if (logentry !== undefined) out.logentry = scrubValue(logentry);
  if (typeof transaction === "string") out.transaction = scrubString(scrubUrl(transaction));
  if (Array.isArray(spans)) out.spans = scrubValue(spans);
  for (const key of ["modules", "sdkProcessingMetadata", "_metadata"]) delete out[key];
  return out as T;
}

/** `null` drops it. Console and input breadcrumbs go; network ones keep method, path and status. */
export function scrubBreadcrumb<T extends object>(crumb: T): T | null {
  const c = crumb as Loose;
  const category = typeof c.category === "string" ? c.category : "";
  if (category.startsWith("console") || category === "ui.input") return null;
  const out: Loose = { ...c };
  if (typeof out.message === "string") out.message = scrubString(out.message);
  if (isObject(out.data)) {
    const data = out.data;
    if (category === "fetch" || category === "xhr") {
      const reduced: Loose = {};
      if (typeof data.method === "string") reduced.method = data.method;
      if (typeof data.status_code === "number") reduced.status_code = data.status_code;
      if (typeof data.url === "string") reduced.url = pathOf(data.url);
      out.data = reduced;
    } else {
      const next: Loose = {};
      for (const [key, value] of Object.entries(data)) {
        next[key] =
          key === "url" || key === "from" || key === "to"
            ? urlOf(value)
            : SENSITIVE_KEY.test(key)
              ? FILTERED
              : scrubValue(value);
      }
      out.data = next;
    }
  }
  return out as T;
}

function pathOf(url: string): string {
  try {
    return new URL(url, "https://placeholder.invalid").pathname;
  } catch {
    return scrubUrl(url);
  }
}
