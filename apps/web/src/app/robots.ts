import type { MetadataRoute } from "next";
import { NOINDEX_EVERYTHING } from "../seo-flags";

/**
 * `NOINDEX_EVERYTHING` (`src/seo-flags.ts`) — this corpus is fictional
 * shelters and animals; nothing here may reach a search index. Disallowing
 * everything is the crawler-cooperative half of that; `next.config.ts`'s
 * `X-Robots-Tag` header (from the same flag) is the half that still applies
 * even if a crawler never requests this file.
 */
export default function robots(): MetadataRoute.Robots {
  if (!NOINDEX_EVERYTHING) {
    return { rules: { userAgent: "*", allow: "/" } };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}
