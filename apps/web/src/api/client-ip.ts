/**
 * The first non-blank entry of a possibly comma-separated forwarded-for
 * header, or `null` if there isn't one.
 *
 * Both the blank check and the split matter, and neither is hypothetical:
 * `headers.get()` returns `""` — not `null` — for a header that is present but
 * empty, so a bare `??` chain would stop there and hand every such request the
 * same `""` rate-limit key. A leading empty element (`", 1.2.3.4"`) produces
 * the same collapse one level down. Both are values a misconfigured upstream
 * proxy really does emit, and either one silently merges unrelated callers into
 * one shared budget — which reads as an over-eager limiter, not as a bug.
 */
function firstForwardedEntry(headerValue: string | null): string | null {
  if (headerValue === null) return null;
  for (const entry of headerValue.split(",")) {
    const trimmed = entry.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

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
 * The preference is safe today and not just forward-looking, which matters because
 * a wrong answer here would mean a spoofed header defeats every rate limiter reading
 * it. Vercel's docs state it plainly, not by omission: "`x-vercel-forwarded-for` ...
 * is identical to the `x-forwarded-for` header. However, `x-forwarded-for` could be
 * overwritten if you're using a proxy on top of Vercel" — "identical to" the header
 * whose own entry, one section above, is the explicit overwrite-to-prevent-spoofing
 * guarantee this whole preference relies on. The two headers carry the same
 * Vercel-computed, anti-spoofed value; `x-vercel-forwarded-for` is only the one that
 * keeps being that value once something else sits in front of Vercel.
 *
 * Every candidate goes through the same first-non-blank-entry parse, including
 * `x-vercel-forwarded-for`. Handling that one as a single opaque value would be
 * a bet that it never carries a chain — and the scenario this ordering exists
 * for (a proxy in front of Vercel) is precisely the scenario where a chain is
 * plausible. If it ever did carry one, an unsplit value would make the whole
 * chain the rate-limit key, and rotating any element of it would mint a fresh
 * budget.
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
    firstForwardedEntry(request.headers.get("x-vercel-forwarded-for")) ??
    firstForwardedEntry(request.headers.get("x-forwarded-for")) ??
    firstForwardedEntry(request.headers.get("x-real-ip")) ??
    "unknown"
  );
}
