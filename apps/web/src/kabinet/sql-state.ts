const property = (source: unknown, name: string): unknown =>
  typeof source === "object" && source !== null
    ? (source as Record<string, unknown>)[name]
    : undefined;

/**
 * A database error's SQLSTATE (five digits or capitals: `57P01`, `08006`), from the driver's
 * error or the one Drizzle wraps, or null. Nothing else of the error is ever logged: a query
 * error's message carries its parameters (an address, a user id, a token).
 */
export const sqlStateOf = (error: unknown): string | null => {
  const code = property(property(error, "cause"), "code") ?? property(error, "code");
  return typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : null;
};
