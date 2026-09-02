import type { NextConfig } from "next";

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
    return [{ source: "/discovery", destination: "/tvaryny/gortaty", permanent: true }];
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
