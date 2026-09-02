import type { NextConfig } from "next";
import { NOINDEX_EVERYTHING } from "./src/seo-flags";

/**
 * H1's real deploy invariant, checked where it's actually load-bearing —
 * found by inspecting the emitted client bundle, not assumed: `NEXT_PUBLIC_
 * R2_PUBLIC_BASE_URL` is inlined into the client bundle at build time
 * (`apps/web/src/image-loader.ts`'s own comment), not read from live
 * `process.env` at request time. `validateEnv()`'s boot-time check
 * (`apps/web/src/api/env.ts`) reads the *server's* environment, which says
 * nothing about what a specific build's client bundle was compiled
 * against — a promoted or rolled-back build, or any build job that doesn't
 * forward this var, ships a client bundle that throws on hydration for
 * every page with a real photo, on an instance whose own `validateEnv()`
 * still passes (the server side is fine; the frozen bundle isn't).
 *
 * Gated on `process.env.VERCEL`/`VERCEL_ENV`, not `NODE_ENV` — `next build`
 * always sets `NODE_ENV=production` regardless of target, and a bare local
 * `next build` (`pnpm run build:web`, CI's structural check — confirmed
 * CI's own workflow never sets either variable) never deploys, so it has
 * no real CDN domain to require. Both are documented as always present in
 * a Vercel build; checking either is cheap insurance against one being
 * absent for a project-configuration reason this repo can't see from
 * here — round-2 review flagged relying on a single variable as
 * fail-open and unverified against Vercel's actual behaviour, not
 * "unlikely," which standing-constraints.md treats as a real gap, not a
 * closed one.
 */
if ((process.env.VERCEL || process.env.VERCEL_ENV) && !process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) {
  throw new Error(
    "Missing required environment variable: NEXT_PUBLIC_R2_PUBLIC_BASE_URL — " +
      "set it in Vercel's Production and Preview environments before building. " +
      "See docs/h1-decisions.md.",
  );
}

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
    /**
     * Pinned to exactly `packages/db/src/image-pipeline/variants.ts`'s
     * three real widths — round-1 review found that Next's own default
     * ladder (`deviceSizes: [640,750,828,1080,1200,1920,2048,3840]`,
     * `imageSizes: [32,48,64,96,128,256,384]`) defeats the whole point of
     * measuring variant sizes from the mock: a `vw`-based `sizes` (the
     * gallery card, the deck card) always resolves to a default-ladder
     * candidate ≥ 640, and `nearestVariant` maps every one of those to
     * `detail` (1120w) — the phone gallery and deck download the largest
     * variant, never `card`. A fixed `sizes="88px"` (the detail
     * thumbnails) needs 176 at 2x DPR, which isn't in the default
     * `imageSizes` ladder either, so it rounds up to 256 → `card`, not
     * `thumb`. With this list, every width Next asks the loader for is
     * one of the three real variant widths exactly, so `nearestVariant`
     * always resolves to the tier the sizing in `docs/h1-decisions.md`
     * was actually measured for.
     *
     * Verified against real served output, not just Next's source
     * (`get-img-props.js`): a `sizes` with no `vw` unit — the fixed
     * `"88px"` thumbnail — still gets offered every width in this list
     * (`176w, 640w, 1120w`), not only 176; a `vw`-based `sizes` — the
     * gallery/deck cards — is filtered down to `640w, 1120w` only. Either
     * way every offered candidate is a real variant width; a DPR-3
     * browser reading the thumbnail's srcset can still legitimately pick
     * 640 (`card`) over 176 (`thumb`) at that density, which is the
     * correct, intended behaviour, not a residual bug.
     */
    deviceSizes: [640, 1120],
    imageSizes: [176],
  },
};

export default nextConfig;
