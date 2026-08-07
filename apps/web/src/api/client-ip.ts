/**
 * The client IP for a request, for rate-limiting purposes only — never for
 * anything access-control-relevant, since "unknown" is an accepted fallback.
 *
 * `x-vercel-forwarded-for` is preferred over the more commonly-reached-for
 * `x-forwarded-for`: per Vercel's own docs (vercel.com/docs/headers/request-headers,
 * checked 2026-08-07), `x-forwarded-for` is overwritten by Vercel specifically to
 * prevent client spoofing — so it's trustworthy today — but that guarantee holds
 * only while Vercel is the outermost edge. `x-vercel-forwarded-for` is Vercel's own
 * explicitly-documented answer to "the value that stays correct even if a proxy is
 * later added in front of Vercel" (a WAF, a CDN). Prefer it now so nothing has to
 * change later purely because a proxy was added.
 *
 * This does NOT survive `CLAUDE.md`'s documented exit ramp to Cloudflare Workers.
 * Cloudflare's trustworthy client-IP header is `cf-connecting-ip`, a different name
 * with a different trust model — if that migration happens, this function needs a
 * new branch, not just a fallback, or every rate limiter reading it goes back to
 * seeing "unknown" for every request.
 *
 * `x-real-ip` stays as a last-resort fallback for any environment that sets it but
 * not the Vercel-specific headers. Local dev sets none of these — `request()`
 * returns "unknown", same as it always has.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
