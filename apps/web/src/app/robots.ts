import type { MetadataRoute } from "next";

/**
 * D-3: always allows crawling, unconditionally — reads no flag at all.
 * Noindex is carried by `next.config.ts`'s `X-Robots-Tag` header and the
 * root layout's `robots` metadata instead; see `SITE_IS_PUBLICLY_DISCOVERABLE`
 * (`src/seo-flags.ts`) for why disallowing crawling here would defeat both.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
