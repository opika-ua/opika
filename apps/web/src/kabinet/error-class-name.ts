/**
 * The only error names a cleaned query error, a masked log line or `maskedLogValue` may show
 * (F8-F1, the PW1-F8 review's note 4). Oleksii, 2026-10-21, verbatim: "(c), an explicit list,
 * which our own classes join by name." No shape rule: a name off this list is shown as `Error`,
 * however much it looks like a class's.
 *
 * Why a list: an error's `name` is free text, and a rule that accepts a shape (letters only, or
 * PascalCase ending in `Error`) also accepts a person's name written that way. A new error class
 * in our own code joins by name here; `error-class-name.test.ts` scans `apps/` and `packages/`
 * and fails while one is missing.
 */
export const ERROR_CLASS_NAMES = [
  // The standard JavaScript errors, and the DOMException names a fetch or a timer raises.
  "Error",
  "AggregateError",
  "EvalError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
  "AbortError",
  "TimeoutError",
  // The library errors the database and auth paths meet: Drizzle (its rollback error is named
  // `DrizzleError`), the two drivers, Better Auth and better-call.
  "DrizzleError",
  "DrizzleQueryError",
  "TransactionRollbackError",
  "PostgresError",
  "NeonDbError",
  "APIError",
  "BetterAuthError",
  "BetterCallError",
  // Every error class defined in our own code, by its class name.
  "CleanedQueryError",
  "ProviderSendError",
  "EmptyRemovalTarget",
  "DemoRemovalDrift",
] as const;

const KNOWN: ReadonlySet<string> = new Set(ERROR_CLASS_NAMES);

/**
 * `error`'s name when it is on `ERROR_CLASS_NAMES`, else `Error`. Never throws: a name that isn't
 * a string (`undefined`, a number, an object, a symbol) is `Error` too, so the error being cleaned
 * or logged is never replaced by a TypeError from reading its name (the review of 78c888f, note 2).
 */
export function errorClassNameOf(error: unknown): string {
  const name: unknown = error instanceof Error ? error.name : undefined;
  return typeof name === "string" && KNOWN.has(name) ? name : "Error";
}
