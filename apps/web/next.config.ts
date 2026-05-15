import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
