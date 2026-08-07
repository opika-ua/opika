import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages so Next.js can resolve .ts source files
  transpilePackages: ["@opika/contracts", "@opika/domain", "@opika/db"],
  images: {
    // Not a per-instance `loader` prop: a function prop from a Server
    // Component into next/image's client boundary fails at request time.
    // See image-loader.ts's own comment for what that failure looked like.
    loader: "custom",
    loaderFile: "./src/image-loader.ts",
  },
};

export default nextConfig;
