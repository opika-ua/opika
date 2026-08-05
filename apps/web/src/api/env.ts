/**
 * Read a required environment variable, throwing at call time if missing.
 *
 * Call this per-request (or lazily on first request), never at the top level
 * of a route module: `next build` imports route modules to collect page data,
 * so module scope runs at build time and a top-level call would make a
 * deployment secret a build-time requirement. The throw then becomes a 500,
 * which is the correct behaviour for a missing deployment secret.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
