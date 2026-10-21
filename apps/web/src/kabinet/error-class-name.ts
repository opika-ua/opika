/**
 * The error classes whose names a cleaned query error or a masked log line may show: the
 * built-ins, the two drivers', Drizzle's, Better Auth's and our own (F8-F1, the PW1-F8 review's
 * note 4). A name is otherwise kept only when it has a class name's shape (`CLASS_NAME`).
 */
const KNOWN_ERROR_CLASSES: ReadonlySet<string> = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
  "PostgresError",
  "NeonDbError",
  "DrizzleError",
  "DrizzleQueryError",
  "TransactionRollbackError",
  "CleanedQueryError",
  "APIError",
  "BetterAuthError",
]);

/** PascalCase ending in `Error` (`PostgresError`, `NeonDbError`): how a class is named, not a person. */
const CLASS_NAME = /^(?:[A-Z][a-z0-9]*)+Error$/;
const MAX_NAME_LENGTH = 64;

/**
 * `error`'s name when it reads as an error class's name, else `Error`. Why: an error's `name` is
 * free text, and anything that only checked it was made of letters (`mykola`) would print a
 * person's name in a log. No library sets a name from data today; this keeps it that way.
 */
export function errorClassNameOf(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return "Error";
  return KNOWN_ERROR_CLASSES.has(name) || CLASS_NAME.test(name) ? name : "Error";
}
