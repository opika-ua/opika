import { APIError, isAPIError } from "better-auth/api";
import { maskAddress } from "./email-senders";
import { errorClassNameOf } from "./error-class-name";
import { field, stringField } from "./fields";
import { sqlStateOf } from "./sql-state";

/** Better Auth's log levels, as its `logger.log` receives them (`success` arrives as `info`). */
export type AuthLogLevel = "debug" | "info" | "warn" | "error";

/** Where a masked line goes: the console by default, a capture in tests. */
export type AuthLogConsole = Pick<Console, "error" | "warn" | "log">;

/** An address, also URL-encoded (`olena%40example.org`, as a query string or a form body has it). */
const EMAIL = /[^\s"'<>(),;:@]+(?:@|%40)[^\s"'<>(),;:@%]+\.[^\s"'<>(),;:@%]+/gi;
const URL_PATTERN = /https?:\/\/[^\s"'<>]+/g;
/** A run of base64url, base64 or hex characters long enough to be looked at (`TOKEN_SHAPED`). */
const TOKEN_RUN = /[A-Za-z0-9_+=-]{12,}/g;

/**
 * A schema or constant name, snake_case in one case: `auth_user_email_unique`,
 * `kabinet_member_one_shelter_idx`, `INTERNAL_SERVER_ERROR`. Words of letters joined by single
 * underscores (a part may be a number), all lower or all upper case. Why it is safe to keep: hex
 * has no underscore, and a base64url token mixes cases and digits within its parts, so a token
 * reads this way by chance about as often as 32 random characters fall in 27 of 64 values.
 */
const IDENTIFIER = /^(?:[a-z]+(?:_(?:[a-z]+|[0-9]+))+|[A-Z]+(?:_(?:[A-Z]+|[0-9]+))+)$/;

/**
 * A token, a hash, a secret: any run of 20 or more such characters, or a run of 12 or more that
 * mixes letters and digits, unless it reads as an identifier (`IDENTIFIER`; F8-F1, the PW1-F8
 * review's note 3: constraint names were masked). The second rule catches a short token (the
 * review's note 5: 19 characters passed) without masking words: a word has no digits, and these
 * are ASCII runs only, so Ukrainian text never matches. A long word (20+ ASCII letters, camelCase
 * included) is masked; that was so before too.
 */
const TOKEN_SHAPED = (run: string): boolean =>
  !IDENTIFIER.test(run) && (run.length >= 20 || (/[0-9]/.test(run) && /[A-Za-z]/.test(run)));

/** An address masked as `maskAddress` does, decoded first if it came URL-encoded. */
const maskedAddress = (match: string): string => {
  try {
    return maskAddress(decodeURIComponent(match));
  } catch {
    return maskAddress(match.replace(/%40/i, "@"));
  }
};

/** A URL's origin and path only: a token in its query or fragment never reaches a log. */
const withoutQuery = (url: string) => url.replace(/[?#].*$/, "");

/**
 * Text Better Auth composed for a log line, masked (PW1-F8): Drizzle's "params:" part cut off,
 * whatever its case (a failed query's message carries its parameters there, the address among
 * them), a URL's query dropped, an address reduced to `o•••@example.org` (`maskAddress`), also
 * when URL-encoded, and anything token-shaped (`TOKEN_SHAPED`) replaced by «•••». Better Auth's own messages are fixed text; what this guards is a value
 * interpolated into one.
 */
export function maskedLogText(text: string): string {
  const [head = ""] = text.split(/\bparams:/i);
  return head
    .replace(URL_PATTERN, withoutQuery)
    .replace(EMAIL, maskedAddress)
    .replace(TOKEN_RUN, (run) => (TOKEN_SHAPED(run) ? "•••" : run))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A value Better Auth passed alongside a message, as a log line may show it. **Never an error's
 * message**, the house rule for query errors (`sql-state.ts`, `invitation-accept.ts`): a query
 * error's message holds its parameters (an address, a user id, a token), so an error is its name
 * and SQLSTATE only (an `instanceof Error` only), and an `APIError` its status and code. Any other
 * object is not printed at all: Better Auth passes user info, request data and the like as objects.
 */
export function maskedLogValue(value: unknown): string {
  try {
    return maskedValueOf(value);
  } catch {
    // A getter or a Proxy that throws while being read (its `name` included): fail closed, so the
    // line still goes out and the getter's own error never does (the review of 73d03fa, finding 3).
    return "Error";
  }
}

function maskedValueOf(value: unknown): string {
  if (isAPIError(value)) {
    const code = stringField(field(value, "body"), "code");
    return `APIError ${String(value.status)}${code !== null && /^[A-Z0-9_]+$/.test(code) ? ` ${code}` : ""}`;
  }
  // Only a real error is shown by its name: any other object with a `name` is user data (a
  // display name), and is shown as `[object]` like the rest (the review's note 3).
  // A name from the explicit list only (`ERROR_CLASS_NAMES`, F8-F1): any other name may be a person's.
  if (value instanceof Error) {
    const code = sqlStateOf(value);
    return `${errorClassNameOf(value)}${code === null ? "" : ` (${code})`}`;
  }
  if (typeof value === "string") return maskedLogText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return value === null || value === undefined ? String(value) : `[${typeof value}]`;
}

/** One masked line for Better Auth's `level`, written where Better Auth's own logger would write it. */
export function writeMaskedAuthLine(
  out: AuthLogConsole,
  level: AuthLogLevel,
  message: unknown,
  args: readonly unknown[],
): void {
  const text = typeof message === "string" ? maskedLogText(message) : maskedLogValue(message);
  const values = args.map(maskedLogValue);
  const line = `[kabinet] Better Auth ${level}: ${[text, ...values].filter((part) => part !== "").join(" · ")}`;
  if (level === "error") out.error(line);
  else if (level === "warn") out.warn(line);
  else out.log(line);
}

/**
 * Better Auth's logging, masked (PW1-F8; the F6 review's finding 4). Oleksii, 2026-10-20,
 * verbatim: "PW1-F8: (a) as I sent before: onAPIError plus Better Auth’s logger through the
 * masking helper, with tests that log lines carry no address, token or password."
 *
 * - `logger.log`: every line Better Auth logs, at every level, masked. Its level stays Better
 *   Auth's default (`warn`), so debug and info lines are dropped before they get here.
 * - `onAPIError.throw`: an error escaping an endpoint or a hook comes back out of `auth.handler`,
 *   where `maskedAuthHandler` logs it. Better Auth 1.7 no longer lets `onAPIError.onError` turn
 *   one into an answer: it swallows what `onError` throws, and better-call (1.4.4, `router.mjs`)
 *   then prints the error whole (`# SERVER_ERROR`), message and parameters included.
 */
export function maskedAuthLogging(out: AuthLogConsole = console) {
  return {
    logger: {
      log: (level: AuthLogLevel, message: string, ...args: unknown[]) =>
        writeMaskedAuthLine(out, level, message, args),
    },
    onAPIError: { throw: true },
  };
}

/**
 * `auth.handler`, with each failure logged once, masked, at error level: a thrown error by its
 * name and SQLSTATE (answered as an empty 500), a 500 answer by its code. Anything short of a 500
 * is an answer (a refusal, a 400) and stays unlogged, as Better Auth's own default leaves it.
 * `auth-log.test.ts` pins that nothing else is printed, so an upgrade that changes it turns red.
 */
export function maskedAuthHandler(
  handler: (request: Request) => Promise<Response>,
  out: AuthLogConsole = console,
): (request: Request) => Promise<Response> {
  return async (request) => {
    let response: Response;
    try {
      response = await handler(request);
    } catch (error) {
      writeMaskedAuthLine(out, "error", "API error", [error]);
      return new Response(null, { status: 500 });
    }
    if (response.status === 500) {
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      const code = stringField(body, "code");
      const answered = new APIError("INTERNAL_SERVER_ERROR", code === null ? undefined : { code });
      writeMaskedAuthLine(out, "error", "API error", [answered]);
    }
    return response;
  };
}
