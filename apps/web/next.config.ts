import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Transpile workspace packages so Next.js can resolve .ts source files
  transpilePackages: ["@opika/contracts", "@opika/domain", "@opika/db"],
};

export default nextConfig;
