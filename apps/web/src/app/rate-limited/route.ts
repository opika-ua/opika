import { uk } from "@opika/i18n";

/**
 * Where `proxy.ts` rewrites a per-IP refusal on the public pages. A rewrite to a page keeps the
 * page's 200, and the status is the point (crawlers and clients back off on 429), so this handler
 * fetches the branded screen (`./screen/page.tsx`, the same `RateLimitedScreen` the animal page
 * shows) and re-serves its HTML as a 429. The proxy adds `Retry-After`. If the fetch fails, the
 * refusal is still a 429 with the sentence, never a 500.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const headers = { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" };
  try {
    const url = new URL(request.url);
    url.pathname = "/rate-limited/screen";
    const cookie = request.headers.get("cookie");
    const screen = await fetch(url, {
      headers: cookie === null ? {} : { cookie },
      signal: AbortSignal.timeout(2_000),
    });
    if (screen.ok) return new Response(await screen.text(), { status: 429, headers });
  } catch {
    // Fall through to the bare refusal below.
  }
  const sentence = uk.detail.rateLimited;
  return new Response(
    `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${sentence}</title></head><body><main><h1>${sentence}</h1></main></body></html>`,
    { status: 429, headers },
  );
}
