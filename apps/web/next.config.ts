import type { NextConfig } from "next";
import { NOINDEX_EVERYTHING } from "./src/seo-flags";

const nextConfig: NextConfig = {
  // Transpile workspace packages so Next.js can resolve .ts source files
  transpilePackages: ["@opika/contracts", "@opika/domain", "@opika/db"],
  /**
   * E5: `/discovery` was the deck's placeholder route while it ran on
   * `generateMockCards` — real data moved it to `/tvaryny/gortaty` (the
   * URL scheme `docs/design/README.md` and `docs/gallery-contract-
   * decisions.md` §6 always specified). `permanent: true` (308): this is
   * a real promotion, not a temporary redirect, and the first redirect
   * this app has needed — checked before assuming `next/link`'s client
   * router would need anything special, since redirects here run before
   * the filesystem and apply to a full navigation the same way regardless.
   */
  async redirects() {
    return [
      { source: "/discovery", destination: "/tvaryny/gortaty", permanent: true },
      /**
       * `docs/design/README.md:427`'s "01 First run" is explicit that the
       * first-visit promise + city choice is a band above the gallery
       * grid, not a separate screen — see `FirstRunBand.tsx` and
       * `tvaryny/page.tsx`. A standalone `/` route was built first,
       * contradicted that spec, and was reverted in favour of this
       * redirect once the conflict was found.
       */
      { source: "/", destination: "/tvaryny", permanent: true },
    ];
  },
  /**
   * `NOINDEX_EVERYTHING` (`src/seo-flags.ts`) — this corpus is fictional,
   * every route is blocked from indexing until real shelters exist.
   * `app/robots.ts` disallows crawling from the same flag; this header
   * additionally covers anything a crawler reaches without ever consulting
   * robots.txt (a direct link, a referrer), and covers `/public` files too
   * — "checked before the filesystem" per Next's own `headers()` docs.
   */
  async headers() {
    if (!NOINDEX_EVERYTHING) return [];
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
  images: {
    // Not a per-instance `loader` prop: a function prop from a Server
    // Component into next/image's client boundary fails at request time.
    // See image-loader.ts's own comment for what that failure looked like.
    loader: "custom",
    loaderFile: "./src/image-loader.ts",
  },
};

export default nextConfig;
