/**
 * Read a required environment variable, throwing at call time if missing.
 *
 * Prefer calling this once at startup and storing the result, but for
 * handler-level secrets that are only needed in specific paths, calling
 * per-request is acceptable — the throw becomes a 500, which is the
 * correct behaviour for a missing deployment secret.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
