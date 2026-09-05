import type { MetadataRoute } from "next";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "../seo-flags";

/**
 * `SITE_IS_PUBLICLY_DISCOVERABLE` (`src/seo-flags.ts`) — this is a fact
 * about launch readiness, independent of whether the registry holds real
 * shelters (see that file's own comment for why they're separate).
 * Disallowing everything is the crawler-cooperative half of not being
 * ready; `next.config.ts`'s `X-Robots-Tag` header (from the same flag) is
 * the half that still applies even if a crawler never requests this file.
 */
export default function robots(): MetadataRoute.Robots {
  if (SITE_IS_PUBLICLY_DISCOVERABLE) {
    return { rules: { userAgent: "*", allow: "/" } };
  }
  return { rules: { userAgent: "*", disallow: "/" } };
}
