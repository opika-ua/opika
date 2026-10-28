/**
 * The shared store's REST credentials: Vercel's integration names
 * (`KV_REST_API_*`) first, Upstash's own (`UPSTASH_REDIS_REST_*`) second, a
 * complete pair as a unit, never cross-matched; an empty value counts as unset.
 * `rate-limit.ts` has the full account.
 */
export function redisCredentialsOf(
  env: Readonly<Record<string, string | undefined>>,
): { url: string; token: string } | null {
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return { url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN };
  }
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
  }
  return null;
}
