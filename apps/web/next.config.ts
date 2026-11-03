import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { assertBuildEnv } from "./src/api/build-env";
import { sentryBuildOptions } from "./src/observability/build-options";
import { REFERRER_POLICY_RULE, securityHeaders } from "./src/security-headers";
import { SITE_IS_PUBLICLY_DISCOVERABLE } from "./src/seo-flags";

/**
 * H1's real deploy invariant, checked where it's actually load-bearing -
 * found by inspecting the emitted client bundle, not assumed: `NEXT_PUBLIC_
 * R2_PUBLIC_BASE_URL` is inlined into the client bundle at build time
 * (`apps/web/src/image-loader.ts`'s own comment), not read from live
 * `process.env` at request time. `validateEnv()`'s boot-time check
 * (`apps/web/src/api/env.ts`) reads the *server's* environment, which says
 * nothing about what a specific build's client bundle was compiled
 * against - a promoted or rolled-back build, or any build job that doesn't
 * forward this var, ships a client bundle that throws on hydration for
 * every page with a real photo, on an instance whose own `validateEnv()`
 * still passes (the server side is fine; the frozen bundle isn't).
 *
 * Gated on `process.env.VERCEL`/`VERCEL_ENV`, not `NODE_ENV` - `next build`
 * always sets `NODE_ENV=production` regardless of target, and a bare local
 * `next build` (`pnpm run build:web`, CI's structural check - confirmed
 * CI's own workflow never sets either variable) never deploys, so it has
 * no real CDN domain to require. Both are documented as always present in
 * a Vercel build; checking either is cheap insurance against one being
 * absent for a project-configuration reason this repo can't see from
 * here - round-2 review flagged relying on a single variable as
 * fail-open and unverified against Vercel's actual behaviour, not
 * "unlikely," which standing-constraints.md treats as a real gap, not a
 * closed one.
 *
 * `CRON_SECRET` (KH-T6) joined the same check, and `RATE_LIMIT_KEY_SECRET`
 * (EM-Q11) after it: a production build (`VERCEL_ENV=production`) refuses to
 * build without either at 32+ characters, in addition to `validateEnv`'s
 * boot check. The rules live in
 * `src/api/build-env.ts`, a pure function, so they are tested without
 * running a build.
 */
assertBuildEnv(process.env);

/**
 * Next buffers every matched non-GET request's whole body (chunked or not) before the proxy's own
 * 403/429 or the route can answer, 10 MB by default. The largest legitimate body on a matched path
 * is 64 KB (`/api/rpc` and `/api/monitoring` each cap there; `docs/launch-gate.md` D has the table),
 * so 128 KB bounds that buffering and still sits above both route caps, which therefore still fire.
 * Bytes, not a string: the number is what the setting's own parser yields.
 */
export const PROXY_CLIENT_MAX_BODY_BYTES = 128 * 1024;

const nextConfig: NextConfig = {
  // Do not announce the framework on every response (audit I2).
  poweredByHeader: false,
  experimental: { proxyClientMaxBodySize: PROXY_CLIENT_MAX_BODY_BYTES },
  // Transpile workspace packages so Next.js can resolve .ts source files
  transpilePackages: ["@opika/contracts", "@opika/domain", "@opika/db"],
  /**
   * Retired routes, all 308: `/tvaryny/gortaty` was the swipe deck (retired 2026-11-02, owner
   * decision); `/discovery` was its earlier placeholder URL. Next carries the query string over,
   * so a deck link with filters lands on the gallery with the same filters.
   */
  async redirects() {
    return [
      { source: "/discovery", destination: "/tvaryny", permanent: true },
      { source: "/tvaryny/gortaty", destination: "/tvaryny", permanent: true },
      { source: "/tvaryny/gortaty/:path*", destination: "/tvaryny", permanent: true },
      /**
       * `docs/design/README.md:427`'s "01 First run" is explicit that the
       * gallery, not a separate screen, is the first-visit surface - see
       * `tvaryny/page.tsx`. A standalone `/` route was built first,
       * contradicted that spec, and was reverted in favour of this
       * redirect once the conflict was found.
       */
      { source: "/", destination: "/tvaryny", permanent: true },
    ];
  },
  /**
   * `SITE_IS_PUBLICLY_DISCOVERABLE` (`src/seo-flags.ts`) - every route is
   * blocked from indexing until this deploy is meant to be found, a
   * separate fact from whether the registry holds real shelters (see that
   * file's own comment). `app/robots.ts` always allows crawling (D-3) - a
   * crawler must be able to fetch a page to see this header at all - so
   * this header, together with the root layout's `robots` metadata, is the
   * entire noindex mechanism now, not one layer behind robots.txt. Covers
   * `/public` files too - "checked before the filesystem" per Next's own
   * `headers()` docs.
   *
   * The security headers (audit F5, `src/security-headers.ts`) go on every
   * route regardless of that flag.
   */
  async headers() {
    const security = {
      source: "/:path*",
      headers: securityHeaders({
        photoBaseUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
        development: process.env.NODE_ENV === "development",
      }),
    };
    if (SITE_IS_PUBLICLY_DISCOVERABLE) return [security, REFERRER_POLICY_RULE];
    return [
      security,
      REFERRER_POLICY_RULE,
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
     * three real widths - round-1 review found that Next's own default
     * ladder (`deviceSizes: [640,750,828,1080,1200,1920,2048,3840]`,
     * `imageSizes: [32,48,64,96,128,256,384]`) defeats the whole point of
     * measuring variant sizes from the mock: a `vw`-based `sizes` (the
     * gallery card, the deck card) always resolves to a default-ladder
     * candidate ≥ 640, and `nearestVariant` maps every one of those to
     * `detail` (1120w) - the phone gallery and deck download the largest
     * variant, never `card`. A fixed `sizes="88px"` (the detail
     * thumbnails) needs 176 at 2x DPR, which isn't in the default
     * `imageSizes` ladder either, so it rounds up to 256 → `card`, not
     * `thumb`. With this list, every width Next asks the loader for is
     * one of the three real variant widths exactly, so `nearestVariant`
     * always resolves to the tier the sizing in `docs/h1-decisions.md`
     * was actually measured for.
     *
     * Verified against real served output, not just Next's source
     * (`get-img-props.js`): a `sizes` with no `vw` unit - the fixed
     * `"88px"` thumbnail - still gets offered every width in this list
     * (`176w, 640w, 1120w`), not only 176; a `vw`-based `sizes` - the
     * gallery/deck cards - is filtered down to `640w, 1120w` only. Either
     * way every offered candidate is a real variant width; a DPR-3
     * browser reading the thumbnail's srcset can still legitimately pick
     * 640 (`card`) over 176 (`thumb`) at that density, which is the
     * correct, intended behaviour, not a residual bug.
     */
    deviceSizes: [640, 1120],
    imageSizes: [176],
  },
};

// H5: wrapped only when a DSN or a source-map upload is configured, so every other build (local,
// CI, the harness) is the unwrapped config. No `tunnelRoute`: the tunnel is our own route.
const sentryOptions = sentryBuildOptions(process.env);
export default sentryOptions === null ? nextConfig : withSentryConfig(nextConfig, sentryOptions);
