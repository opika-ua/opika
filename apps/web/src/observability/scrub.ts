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

// Labels are length-bounded (RFC maxima) so a long run of word characters cannot make the scan quadratic.
const EMAIL =
  /[\p{L}\p{N}._%+'-]{1,64}@[\p{L}\p{N}-]{1,63}(?:\.[\p{L}\p{N}-]{1,63}){0,8}\.\p{L}{2,24}/gu;
// UA numbers: optional 38 / +38 prefix, a 0, then nine digits in any grouping (0501234567,
// +380 (50) 123-45-67, 380501234567, en-dash separators). Never part of a longer digit run.
const PHONE = /(?<![\p{N}])\(?(?:\+?38[\s().–-]*)?0(?:[\s().–-]*\d){9}(?![\p{N}]|:\d)/gu;
// Any other international number: "+" or "00", then 8 to 15 digits (E.164) with spaces, dots, dashes
// and brackets between them (+48 500 123 456, +49 (0) 30 1234567, 0033.1.23.45.67.89). Each step eats
// one digit after an optional separator run, so the scan is linear.
const PHONE_INTL =
  /(?<![\p{L}\p{N}])\(?(?:\+|00)[\s().–-]*\d(?:[\s().–-]*\d){7,14}(?![\p{N}]|:\d)/gu;
// Polish-style groups without a prefix: 500 123 456, 050/123-45-67.
const PHONE_GROUPS =
  /(?<![\p{N}/])(?:[4-8]\d{2}[\s–-]\d{3}[\s–-]\d{3}|0?\d{2,3}\/\d{3}[\s–-]?\d{2}[\s–-]?\d{2})(?![\p{N}])/gu;
const TELEGRAM_LINK =
  /(?<![\p{L}\p{N}.])(?:(?:https?:\/\/)?(?:t\.me|telegram\.(?:me|dog))\/[^\s"'<>)]*|tg:\/\/[^\s"'<>)]*)/giu;
// A handle only counts as one next to the word telegram (either side, short gap), so "@types/node" stays.
const TELEGRAM_WORD = "(?:telegram|tg|телеграм|телега)";
const HANDLE_AFTER = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(${TELEGRAM_WORD}\p{L}*[^@\n]{0,24}?)@\w{3,32}`,
  "giu",
);
const HANDLE_BEFORE = new RegExp(
  String.raw`@\w{3,32}(?=[^@\n]{0,24}?(?<![\p{L}\p{N}])${TELEGRAM_WORD})`,
  "giu",
);
// Street addresses: a street word, a name of up to three words, then a house number. The number is
// required, so "вулиця Шевченка" alone stays; the street word must end in a dot or a space ("вулкан" is safe).
const NAME = String.raw`[\p{L}'’.-]+(?:\s+[\p{L}'’.-]+){0,2}`;
const NUMBER = String.raw`(?:№\s*)?\d{1,4}\p{L}?(?:[/-]\d{1,4}\p{L}?)?`;
const STREET_WORD_UK = String.raw`(?:вул(?:иця)?|просп(?:ект)?|пров(?:улок)?|бульв(?:ар)?|пр-т|б-р)(?:\.\s*|\s+)`;
const STREET_WORD_PL = String.raw`(?:ul(?:ica)?|al|aleja)(?:\.\s*|\s+)`;
const HOUSE = String.raw`(?:(?:буд(?:инок)?|б|д|nr)\.?\s*)?`;
const ADDRESS_LOCAL = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:\d{1,4}\p{L}?,?\s*)?(?:${STREET_WORD_UK}|${STREET_WORD_PL})${NAME},?\s*${HOUSE}${NUMBER}(?![\p{N}])`,
  "giu",
);
const ADDRESS_LOCAL_NUMBER_FIRST = new RegExp(
  String.raw`(?<![\p{L}\p{N}])\d{1,4}\p{L}?,\s*(?:${STREET_WORD_UK}|${STREET_WORD_PL})${NAME}`,
  "giu",
);
const EN_SUFFIX = "(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Boulevard|Blvd)";
const EN_NAME = String.raw`(?:[A-Z][\p{L}'-]*\s+){1,3}`;
const ADDRESS_EN_NUMBER_FIRST = new RegExp(
  String.raw`(?<![\p{L}\p{N}])\d{1,5}[A-Za-z]?\s+${EN_NAME}${EN_SUFFIX}\b\.?`,
  "gu",
);
const ADDRESS_EN_NAME_FIRST = new RegExp(
  String.raw`(?<![\p{L}\p{N}])${EN_NAME}${EN_SUFFIX}\b\.?,?\s*(?:No\.?\s*)?\d{1,5}[A-Za-z]?(?![\p{N}])`,
  "gu",
);
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
    .replace(TELEGRAM_LINK, FILTERED)
    .replace(HANDLE_AFTER, `$1${FILTERED}`)
    .replace(HANDLE_BEFORE, FILTERED)
    .replace(PHONE, FILTERED)
    .replace(PHONE_INTL, FILTERED)
    .replace(PHONE_GROUPS, FILTERED)
    .replace(ADDRESS_LOCAL, FILTERED)
    .replace(ADDRESS_LOCAL_NUMBER_FIRST, FILTERED)
    .replace(ADDRESS_EN_NUMBER_FIRST, FILTERED)
    .replace(ADDRESS_EN_NAME_FIRST, FILTERED);
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

/** Only the page address and the method stay of a request: no header (the UA included), cookie, body or query. */
function scrubRequest(request: unknown): Loose | undefined {
  if (!isObject(request)) return undefined;
  const out: Loose = {};
  if (typeof request.url === "string") out.url = scrubString(scrubUrl(request.url));
  if (typeof request.method === "string") out.method = request.method;
  return out;
}

// Closed lists, applied here so a forged envelope or a tampered client cannot carry free text in a
// context name. "unknown" is the parser's own no-information value.
const BROWSER_FAMILIES = new Set([
  "Chrome",
  "Safari",
  "Firefox",
  "Edge",
  "Samsung Internet",
  "Opera",
  "Yandex",
  "unknown",
]);
const OS_FAMILIES = new Set([
  "iOS",
  "iPadOS",
  "Android",
  "Windows",
  "macOS",
  "Linux",
  "ChromeOS",
  "unknown",
]);
const OTHER = "other";
// A major version only: one to three digits, so "130.0.6723.58" is dropped, not shortened.
const CONTEXT_MAJOR = /^\d{1,3}$/;

function coarseContext(value: unknown, families: ReadonlySet<string>): Loose {
  if (!isObject(value) || typeof value.name !== "string") return { name: OTHER };
  const kept: Loose = { name: families.has(value.name) ? value.name : OTHER };
  if (typeof value.version === "string" && CONTEXT_MAJOR.test(value.version)) {
    kept.version = value.version;
  }
  return kept;
}

/** Only `browser` and `os` stay, in the strict shape above; every other context is dropped. */
function scrubContexts(contexts: unknown): Loose | undefined {
  if (!isObject(contexts)) return undefined;
  const out: Loose = {};
  if ("browser" in contexts) out.browser = coarseContext(contexts.browser, BROWSER_FAMILIES);
  if ("os" in contexts) out.os = coarseContext(contexts.os, OS_FAMILIES);
  return out;
}

/** Source-map matching needs each bundle's debug id and file; nothing else of `debug_meta` stays. */
function scrubDebugMeta(debugMeta: unknown): Loose | undefined {
  if (!isObject(debugMeta) || !Array.isArray(debugMeta.images)) return undefined;
  const images = debugMeta.images.flatMap((image) => {
    if (!isObject(image) || typeof image.debug_id !== "string") return [];
    const kept: Loose = { debug_id: scrubString(image.debug_id) };
    if (typeof image.type === "string") kept.type = image.type;
    if (typeof image.code_file === "string") kept.code_file = urlOf(image.code_file);
    return [kept];
  });
  return { images };
}

/** Top-level keys that may stay; anything else (fingerprint, threads, user, breadcrumbs, ...) is dropped. */
const PLAIN_KEYS = [
  "event_id",
  "type",
  "timestamp",
  "start_timestamp",
  "platform",
  "level",
  "environment",
  "release",
  "dist",
  "sdk",
] as const;

/**
 * Applies to any event type (error, transaction, anything else) and builds the result from an
 * allow-list of top-level keys, so a key a future SDK adds is dropped until it is reviewed. Request
 * data, user, breadcrumbs, local variables and source lines are never copied; every string that
 * remains is scrubbed.
 */
export function scrubEvent<T extends object>(event: T): T {
  const source = event as Loose;
  const out: Loose = {};
  for (const key of PLAIN_KEYS) if (key in source) out[key] = scrubValue(source[key]);
  const { request, exception, extra, contexts, tags, message, logentry, transaction, spans } =
    source;
  const scrubbedRequest = scrubRequest(request);
  if (scrubbedRequest !== undefined) out.request = scrubbedRequest;
  if (exception !== undefined) out.exception = scrubException(exception);
  if (extra !== undefined) out.extra = scrubValue(extra);
  const scrubbedContexts = scrubContexts(contexts);
  if (scrubbedContexts !== undefined) out.contexts = scrubbedContexts;
  if (tags !== undefined) out.tags = scrubValue(tags);
  if (typeof message === "string") out.message = scrubString(message);
  if (logentry !== undefined) out.logentry = scrubValue(logentry);
  if (typeof transaction === "string") out.transaction = scrubString(scrubUrl(transaction));
  if (Array.isArray(spans)) out.spans = scrubValue(spans);
  const debugMeta = scrubDebugMeta(source.debug_meta);
  if (debugMeta !== undefined) out.debug_meta = debugMeta;
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
